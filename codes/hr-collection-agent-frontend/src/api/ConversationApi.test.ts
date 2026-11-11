import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, sampleSendMessageResponse, sampleSessionDetail, sampleSuggestion, stubFetch, stubHangingFetch } from '../test/ApiMocks';
import { CHAT_TIMEOUT_MS } from './ApiClient';
import { applySuggestions, cancelSuggestions, sendMessage } from './ConversationApi';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ConversationApi', () => {
  it('sendMessage posts {content}', async () => {
    const fetchMock = stubFetch(() => jsonResponse(201, sampleSendMessageResponse()));
    const result = await sendMessage('s1', '你好');
    expect(result.assistant_message.role).toBe('assistant');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method, init.body]).toEqual(['/api/v1/sessions/s1/messages', 'POST', '{"content":"你好"}']);
  });

  it('sendMessage maps chat_failed and times out after 75s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => errorResponse(502, { code: 'chat_failed' }));
    await expect(sendMessage('s1', 'x')).rejects.toMatchObject({ code: 'chat_failed' });
    vi.useFakeTimers();
    stubHangingFetch();
    const pending = sendMessage('s1', 'x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CHAT_TIMEOUT_MS);
    expect(await pending).toMatchObject({ code: 'client_timeout' });
  });

  it('apply and cancel post to the card without a body', async () => {
    const answer = { message_id: 'm1', suggestions: [sampleSuggestion({ status: 'applied', old_value: null })], fields: sampleSessionDetail('reviewing').fields, updated_at: '2026-11-10T09:00:00Z' };
    const fetchMock = stubFetch(() => jsonResponse(200, answer));
    await applySuggestions('s1', 'm1');
    await cancelSuggestions('s1', 'm1');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url} ${init.body ?? ''}`)).toEqual([
      'POST /api/v1/sessions/s1/messages/m1/apply ',
      'POST /api/v1/sessions/s1/messages/m1/cancel ',
    ]);
  });
});
