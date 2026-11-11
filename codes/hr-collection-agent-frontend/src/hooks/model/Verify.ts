import type { ChatMessage, Suggestion } from '../../types/Conversation';
import type { SessionDetail } from '../../types/Session';

// Decisions after a request whose outcome is unknown (timeout / network / unknown_error), taken from a re-read session
// (design TD-19, G2-04). Pure functions. F-03: anything that cannot be read as "saved" / "updated" falls back to
// "not confirmed" - success is never the default.

/** The user message and its assistant reply that the lost request created, or null when it did not reach the server. */
export function matchSentMessage(
  messages: readonly ChatMessage[],
  knownIds: readonly string[],
  text: string,
): { user: ChatMessage; assistant: ChatMessage } | null {
  const assistant = messages.at(-1);
  const user = messages.at(-2);
  if (!assistant || !user) return null;
  if (user.role !== 'user' || assistant.role !== 'assistant' || user.content !== text) return null;
  if (knownIds.includes(user.message_id) || knownIds.includes(assistant.message_id)) return null;
  return { user, assistant };
}

export type ConfirmReadDecision = { kind: 'saved'; already: boolean } | { kind: 'still_reviewing' };

/** After an unknown save result: saved only when the server says status=saved; `already` = it hit an existing record. */
export function decideAfterConfirmRead(detail: SessionDetail): ConfirmReadDecision {
  if (detail.status !== 'saved') return { kind: 'still_reviewing' };
  return { kind: 'saved', already: detail.update_state === 'pending' };
}

export type UpdateReadDecision = 'applied' | 'pending' | 'other';

/** After an unknown update result: "applied" only when the server says saved with update_state=applied. */
export function decideAfterUpdateRead(detail: SessionDetail): UpdateReadDecision {
  if (detail.status !== 'saved') return 'other';
  if (detail.update_state === 'applied') return 'applied';
  return detail.update_state === 'pending' ? 'pending' : 'other';
}

export type CardStatus = 'pending' | 'applied' | 'cancelled' | 'none';

/** Card state of one assistant message, summarised from the backend's per-suggestion status (the frontend infers nothing). */
export function cardStatus(suggestions: readonly Suggestion[]): CardStatus {
  if (suggestions.some((s) => s.applicable && s.status === 'pending')) return 'pending';
  if (suggestions.some((s) => s.status === 'applied')) return 'applied';
  if (suggestions.some((s) => s.status === 'cancelled')) return 'cancelled';
  return 'none';
}
