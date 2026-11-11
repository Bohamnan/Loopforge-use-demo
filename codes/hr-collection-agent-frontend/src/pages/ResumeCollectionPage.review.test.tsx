import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUME_FIELD_KEYS } from '../types/ResumeModel';
import { SECTIONS_READY, sampleDraft, sessionStub, uploadResume } from '../test/PageHarness';
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

/** Opens a reviewing session (by uploading a file; the fake backend answers with the given draft). */
async function openReview(draft = sampleDraft()) {
  sessionStub(draft);
  const { container } = renderPage();
  await uploadResume(container);
  await SECTIONS_READY();
}

describe('recognised result display (REQ-FE-02, REQ-FE-05.2)', () => {
  it('shows all 11 sections and all 22 fields after opening a session', async () => {
    await openReview();
    const titles = ['基本信息', '求职意向', '个人信息', '个人优势', '工作经历', '项目经历', '教育背景', '专业技能', '证书与荣誉', '语言能力', '自我评价'];
    for (const title of titles) {
      expect(screen.getByRole('heading', { name: new RegExp(title) })).toBeInTheDocument();
    }
    const keys = Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));
    expect([...keys].sort()).toEqual([...RESUME_FIELD_KEYS].sort());
  });

  it('shows the four statuses with the designed wording and does not show recognized as confirmed', async () => {
    await openReview();
    const phone = document.querySelector('[data-field="phone"]') as HTMLElement;
    expect(within(phone).getByText('待确认')).toBeInTheDocument();
    expect(within(phone).queryByText('已确认')).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-field="name"]') as HTMLElement).getByText('已确认')).toBeInTheDocument();
    expect(within(document.querySelector('[data-field="work_years"]') as HTMLElement).getByText('不确定、请确认')).toBeInTheDocument();
    expect(within(document.querySelector('[data-field="gender"]') as HTMLElement).getByText('待补充')).toBeInTheDocument();
  });

  it('shows the full phone number and the file card', async () => {
    await openReview();
    expect(screen.getByDisplayValue('13800138000')).toBeInTheDocument(); // full number, not masked (P-10)
    expect(screen.getByText('合成简历.pdf')).toBeInTheDocument();
  });

  it('does not invent values for missing fields', async () => {
    await openReview();
    const gender = document.querySelector('[data-field="gender"]') as HTMLElement;
    expect(within(gender).getByText('（未提供）')).toBeInTheDocument();
  });

  it('opens the first section that needs attention and marks it active', async () => {
    await openReview();
    const active = document.querySelector('section[aria-current="true"]') as HTMLElement;
    expect(within(active).getByRole('heading', { name: /基本信息/ })).toBeInTheDocument();
  });

  it('opens the first uncertain section when nothing is missing', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    draft.fields.work_years.status = 'uncertain';
    await openReview(draft);
    const active = document.querySelector('section[aria-current="true"]') as HTMLElement;
    expect(within(active).getByRole('heading', { name: /个人信息/ })).toBeInTheDocument();
  });

  it('lets the user switch the active section with the 修改 entry and the summary chips', async () => {
    await openReview();
    await userEvent.click(screen.getByRole('button', { name: /求职意向/ })); // summary chip
    expect(within(document.querySelector('section[aria-current="true"]') as HTMLElement).getByRole('heading', { name: /求职意向/ })).toBeInTheDocument();
    const personal = screen.getByRole('heading', { name: /个人信息/ }).closest('section') as HTMLElement;
    await userEvent.click(within(personal).getByRole('button', { name: /修\s?改/ }));
    expect(personal).toHaveAttribute('aria-current', 'true');
  });

  it('shows the full read-only result when everything is already confirmed', async () => {
    const draft = sampleDraft();
    for (const key of RESUME_FIELD_KEYS) draft.fields[key].status = 'confirmed';
    await openReview(draft);
    expect(document.querySelectorAll('[data-field]')).toHaveLength(22);
    expect(document.querySelector('section[aria-current="true"]')).toBeNull();
  });
});
