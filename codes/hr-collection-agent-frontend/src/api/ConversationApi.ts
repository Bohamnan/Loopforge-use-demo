import type { SendMessageRequest, SendMessageResponse, SuggestionActionResponse } from '../types/Conversation';
import { CHAT_TIMEOUT_MS, request } from './ApiClient';
import { isSendMessageResponse, isSuggestionActionResponse } from './ResponseShapes';

const messagePath = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/messages`;

/** POST /sessions/{id}/messages: one synchronous model call, 75s timeout. Chat text never triggers a save or an update. */
export function sendMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
  const body: SendMessageRequest = { content };
  return request<SendMessageResponse>(messagePath(sessionId), {
    method: 'POST',
    body,
    timeoutMs: CHAT_TIMEOUT_MS,
    validate: isSendMessageResponse,
  });
}

/** POST …/messages/{mid}/apply: apply every applicable suggestion of the card. */
export function applySuggestions(sessionId: string, messageId: string): Promise<SuggestionActionResponse> {
  return request<SuggestionActionResponse>(`${messagePath(sessionId)}/${encodeURIComponent(messageId)}/apply`, {
    method: 'POST',
    validate: isSuggestionActionResponse,
  });
}

/** POST …/messages/{mid}/cancel: cancel the pending suggestions of the card. */
export function cancelSuggestions(sessionId: string, messageId: string): Promise<SuggestionActionResponse> {
  return request<SuggestionActionResponse>(`${messagePath(sessionId)}/${encodeURIComponent(messageId)}/cancel`, {
    method: 'POST',
    validate: isSuggestionActionResponse,
  });
}
