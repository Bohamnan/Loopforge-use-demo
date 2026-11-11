// Mirror of OpenAPI 0.2.0 conversation schemas (see ResumeModel.ts for the maintenance rule).
import type { ResumeFields, SuggestionField } from './ResumeModel';

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Scalar fields carry string | null; the four text-list fields carry the complete new list. */
export type SuggestionValue = string | string[] | null;

export const SUGGESTION_REASONS = ['required', 'invalid_format', 'invalid_type', 'too_long'] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

export const SUGGESTION_STATUSES = ['pending', 'applied', 'cancelled'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface Suggestion {
  suggestion_id: string;
  field: SuggestionField;
  /** Only for reviewing sessions and pending suggestions; null otherwise or when the field is empty. */
  old_value: SuggestionValue;
  new_value: SuggestionValue;
  /** false = no "apply" button, show the reason. */
  applicable: boolean;
  reason: SuggestionReason | null;
  status: SuggestionStatus;
}

export interface ChatMessage {
  message_id: string;
  role: ChatRole;
  /** User messages are at most 2000 characters. */
  content: string;
  /** Only assistant messages may be non-empty; one assistant message = one card. */
  suggestions: Suggestion[];
  created_at: string;
}

export interface SendMessageRequest {
  /** 1..2000 characters. */
  content: string;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export interface SuggestionActionResponse {
  message_id: string;
  /** Latest state of every suggestion of the card. */
  suggestions: Suggestion[];
  fields: ResumeFields;
  updated_at: string;
}
