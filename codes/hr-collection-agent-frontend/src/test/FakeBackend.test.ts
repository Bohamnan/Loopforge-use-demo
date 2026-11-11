import { describe, expect, it } from 'vitest';
import { FakeBackend } from './FakeBackend';
import { sampleSessionDetail } from './ApiMocks';

const call = async (b: FakeBackend, method: string, url: string, body?: unknown) => {
  const res = await b.handle(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
};

describe('FakeBackend (fixture self-check)', () => {
  it('saves once, then the same person hits the idempotency key and keeps an update candidate', async () => {
    const b = new FakeBackend({ sessions: [sampleSessionDetail('reviewing')] });
    const id = '00000000-0000-4000-8000-000000000001';
    const first = await call(b, 'POST', `/api/v1/sessions/${id}/resume`, { confirmed: true });
    expect([first.status, first.json.already_saved]).toEqual([201, false]);
    const form = new FormData();
    form.append('file', new File(['x'], 'a.pdf'));
    const created = { json: await (await b.handle('/api/v1/sessions', { method: 'POST', body: form })).json() };
    const second = await call(b, 'POST', `/api/v1/sessions/${created.json.session_id}/resume`, { confirmed: true });
    expect([second.status, second.json.already_saved]).toEqual([200, true]);
    const detail = await call(b, 'GET', `/api/v1/sessions/${created.json.session_id}`);
    expect([detail.json.status, detail.json.update_state]).toEqual(['saved', 'pending']);
    const put = await call(b, 'PUT', `/api/v1/sessions/${created.json.session_id}/resume`, { confirm_update: true });
    expect(put.status).toBe(200);
  });

  it('applies a suggestion only through apply, and injected faults can take effect without an answer', async () => {
    const b = new FakeBackend({
      sessions: [sampleSessionDetail('reviewing')],
      suggest: () => [{ suggestion_id: 's1', field: 'job_title', old_value: null, new_value: '总监', applicable: true, reason: null, status: 'pending' }],
      faults: [{ match: /POST .*\/messages$/, networkError: true, afterEffect: true }],
    });
    const id = '00000000-0000-4000-8000-000000000001';
    await expect(b.handle(`/api/v1/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ content: 'x' }) })).rejects.toThrow();
    const detail = (await call(b, 'GET', `/api/v1/sessions/${id}`)).json;
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1].suggestions[0].old_value).toBe('供应链经理');
    const applied = await call(b, 'POST', `/api/v1/sessions/${id}/messages/${detail.messages[1].message_id}/apply`);
    expect(applied.json.fields.job_title).toEqual({ value: '总监', status: 'confirmed' });
  });
});
