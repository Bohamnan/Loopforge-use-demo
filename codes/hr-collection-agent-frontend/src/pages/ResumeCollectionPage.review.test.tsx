import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import { jsonResponse, sampleDraft, stubFetch } from '../test/ApiMocks';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <StrictMode>
      <ResumeCollectionPage />
    </StrictMode>,
  );
}

const restore = (draft = sampleDraft()) => stubFetch(() => jsonResponse(200, draft));

describe('recognised result display (REQ-FE-02, REQ-FE-05.2)', () => {
  it('shows all 11 sections and all 22 fields after restoring a draft', async () => {
    restore();
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    const titles = ['基本信息', '求职意向', '个人信息', '个人优势', '工作经历', '项目经历', '教育背景', '专业技能', '证书与荣誉', '语言能力', '自我评价'];
    for (const title of titles) {
      expect(screen.getByRole('heading', { name: new RegExp(title) })).toBeInTheDocument();
    }
    const keys = Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));
    expect([...keys].sort()).toEqual([...RESUME_FIELD_KEYS].sort());
  });

  it('shows the four statuses with the designed wording and does not show recognized as confirmed', async () => {
    restore();
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    const phone = document.querySelector('[data-field="phone"]') as HTMLElement;
    expect(within(phone).getByText('待确认')).toBeInTheDocument();
    expect(within(phone).queryByText('已确认')).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-field="name"]') as HTMLElement).getByText('已确认')).toBeInTheDocument();
    expect(within(document.querySelector('[data-field="work_years"]') as HTMLElement).getByText('不确定、请确认')).toBeInTheDocument();
    expect(within(document.querySelector('[data-field="gender"]') as HTMLElement).getByText('待补充')).toBeInTheDocument();
  });

  it('shows the full phone number and the restored file card', async () => {
    restore();
    renderPage();
    expect(await screen.findByText('13800138000')).toBeInTheDocument();
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
  });

  it('does not invent values for missing fields', async () => {
    restore();
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    const gender = document.querySelector('[data-field="gender"]') as HTMLElement;
    expect(within(gender).getByText('（未提供）')).toBeInTheDocument();
  });

  it('opens the first section that needs attention and marks it active', async () => {
    restore();
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    const active = document.querySelector('[aria-current="true"]') as HTMLElement;
    expect(within(active).getByRole('heading', { name: /基本信息/ })).toBeInTheDocument();
  });

  it('opens the first uncertain section when nothing is missing', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    draft.fields.work_years.status = 'uncertain';
    restore(draft);
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    const active = document.querySelector('[aria-current="true"]') as HTMLElement;
    expect(within(active).getByRole('heading', { name: /个人信息/ })).toBeInTheDocument();
  });

  it('lets the user switch the active section with the 修改 entry and the summary chips', async () => {
    restore();
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ })); // summary chip
    expect(within(document.querySelector('[aria-current="true"]') as HTMLElement).getByRole('heading', { name: /求职意向/ })).toBeInTheDocument();
    const personal = screen.getByRole('heading', { name: /个人信息/ }).closest('section') as HTMLElement;
    await userEvent.click(within(personal).getByRole('button', { name: /修\s?改/ }));
    expect(personal).toHaveAttribute('aria-current', 'true');
  });

  it('shows the same layout after an upload as after a restore, without the restored notice', async () => {
    stubFetch((url, init) =>
      url.endsWith('/current') ? new Response(JSON.stringify({ code: 'draft_not_found', message: 'm', request_id: 'r' }), { status: 404 }) : (init.method === 'POST' ? jsonResponse(201, sampleDraft()) : jsonResponse(200, {})),
    );
    const { container } = renderPage();
    await screen.findByText(/上传简历文件/);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], '合成简历.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('heading', { name: /基本信息/ })).toBeInTheDocument();
    expect(screen.queryByText('已为你恢复未完成的简历')).not.toBeInTheDocument();
    const keys = Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));
    expect(keys).toHaveLength(22);
  });

  it('shows the full read-only result when everything is already confirmed', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    restore(draft);
    renderPage();
    await screen.findByText('已为你恢复未完成的简历');
    expect(document.querySelectorAll('[data-field]')).toHaveLength(22);
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
  });
});
