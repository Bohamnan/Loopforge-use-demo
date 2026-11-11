import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, stubFetch } from '../test/ApiMocks';
import { SECTIONS_READY, fieldsResponse, sampleDraft, sessionStub, uploadResume, type FieldsPatch } from '../test/PageHarness';
import ResumeCollectionPage from './ResumeCollectionPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

type Patch = FieldsPatch;

const backend = sessionStub;
const patches = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls.filter(([, init]) => init.method === 'PATCH');
const body = (mock: ReturnType<typeof stubFetch>, n = 0) => JSON.parse(patches(mock)[n]![1].body as string) as Patch;

async function openSection(title: string, draft = sampleDraft(), onPatch?: (b: Patch) => Response) {
  const mock = backend(draft, onPatch);
  const { container } = render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>
    </StrictMode>,
  );
  await uploadResume(container);
  await SECTIONS_READY();
  const heading = screen.getByRole('heading', { name: new RegExp(title) });
  const section = heading.closest('section') as HTMLElement;
  if (!section.hasAttribute('aria-current')) {
    await userEvent.click(within(section).getByRole('button', { name: /修\s?改/ }));
  }
  return { mock, section: () => screen.getByRole('heading', { name: new RegExp(title) }).closest('section') as HTMLElement };
}
const items = (section: HTMLElement) => Array.from(section.querySelectorAll('[data-item]')) as HTMLElement[];
const confirmButton = () => screen.getByRole('button', { name: /确认本区|确认修改|已确认/ });

describe('experience lists (REQ-FE-03.3)', () => {
  it('lists the existing items as editable cards', async () => {
    const { section } = await openSection('工作经历');
    expect(items(section())).toHaveLength(1);
    expect(within(items(section())[0]!).getByLabelText('公司名称')).toHaveValue('合成公司');
  });

  it('adds, edits and deletes items and submits the complete new list', async () => {
    const { mock, section } = await openSection('工作经历');
    await userEvent.click(within(section()).getByRole('button', { name: /添加一条/ }));
    await userEvent.type(within(items(section())[1]!).getByLabelText('公司名称'), '乙公司');
    await userEvent.type(within(items(section())[0]!).getByLabelText('职位名称'), '长');
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(body(mock).fields).toEqual({
      work_experiences: [
        { company: '合成公司', position: '主管长', start_date: '2018.07', end_date: '至今', responsibilities: [], achievements: [] },
        { company: '乙公司' },
      ],
    });
  });

  it('submits [] after every item is deleted (confirm as empty)', async () => {
    const { mock, section } = await openSection('教育背景');
    await userEvent.click(within(items(section())[0]!).getByRole('button', { name: /删除这一条/ }));
    expect(items(section())).toHaveLength(0);
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(body(mock).fields).toEqual({ educations: [] });
  });

  it('does not submit items that were added but left empty', async () => {
    const { mock, section } = await openSection('项目经历');
    await userEvent.click(within(section()).getByRole('button', { name: /添加一条/ }));
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect(body(mock).fields).toEqual({ project_experiences: [] });
  });

  it('edits responsibilities inside an item', async () => {
    const { mock, section } = await openSection('工作经历');
    await userEvent.click(within(items(section())[0]!).getAllByRole('button', { name: /添加一项/ })[0]!);
    const boxes = within(items(section())[0]!).getAllByRole('textbox');
    await userEvent.type(boxes[boxes.length - 1]!, '负责采购');
    await userEvent.click(confirmButton());
    await waitFor(() => expect(patches(mock)).toHaveLength(1));
    expect((body(mock).fields.work_experiences as { responsibilities: string[] }[])[0]!.responsibilities).toEqual(['负责采购']);
  });

  it('blocks an over-long sub-field locally, at the right item, and sends nothing', async () => {
    const { mock, section } = await openSection('工作经历');
    await userEvent.click(within(section()).getByRole('button', { name: /添加一条/ }));
    fireEvent.change(within(items(section())[1]!).getByLabelText('公司名称'), { target: { value: 'a'.repeat(2001) } });
    await userEvent.click(confirmButton());
    expect(within(items(section())[1]!).getByText('内容过长')).toBeInTheDocument();
    expect(within(items(section())[0]!).queryByText('内容过长')).not.toBeInTheDocument();
    expect(patches(mock)).toHaveLength(0);
  });

  it('shows backend 422 details at the item they point to, and clears them when the list is edited', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const draft = sampleDraft();
    draft.fields.work_experiences.value = [{ company: '甲' }, { company: '乙', start_date: 'x' }];
    const { section } = await openSection('工作经历', draft, () =>
      errorResponse(422, { code: 'validation_failed', message: '提交内容有误', details: [{ field: 'work_experiences[1].start_date', reason: 'invalid_format' }] }),
    );
    await userEvent.click(confirmButton());
    await waitFor(() => expect(within(items(section())[1]!).getByText('格式不正确')).toBeInTheDocument());
    expect(within(items(section())[0]!).queryByText('格式不正确')).not.toBeInTheDocument();
    // deleting the first item shifts indexes, so stale index-based errors must disappear
    await userEvent.click(within(items(section())[0]!).getByRole('button', { name: /删除这一条/ }));
    expect(within(section()).queryByText('格式不正确')).not.toBeInTheDocument();
  });

  it('stops adding at 20 items', async () => {
    const draft = sampleDraft();
    draft.fields.work_experiences.value = Array.from({ length: 20 }, (_, i) => ({ company: `公司${i}` }));
    const { section } = await openSection('工作经历', draft);
    expect(within(section()).getByRole('button', { name: /添加一条/ })).toBeDisabled();
  });

  it('locks the editor while the section is being saved', async () => {
    let release: (r: Response) => void = () => undefined;
    const mock = sessionStub(sampleDraft(), () => new Promise<Response>((r) => (release = r)) as unknown as Response);
    const { container } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ResumeCollectionPage />
      </ConfigProvider>,
    );
    await uploadResume(container);
    await SECTIONS_READY();
    const heading = screen.getByRole('heading', { name: /工作经历/ });
    await userEvent.click(within(heading.closest('section') as HTMLElement).getByRole('button', { name: /修\s?改/ }));
    await userEvent.click(confirmButton());
    const sec = screen.getByRole('heading', { name: /工作经历/ }).closest('section') as HTMLElement;
    expect(within(sec).getByLabelText('公司名称')).toBeDisabled();
    expect(within(sec).getByRole('button', { name: /添加一条/ })).toBeDisabled();
    expect(patches(mock)).toHaveLength(1);
    release(fieldsResponse(sampleDraft().fields));
  });
});
