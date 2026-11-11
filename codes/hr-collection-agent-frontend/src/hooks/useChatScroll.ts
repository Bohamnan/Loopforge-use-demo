import { useState } from 'react';
import type { Phase, View } from './model/SessionReducer';
import type { SectionKey } from './model/SectionConfig';

export interface ScrollInput {
  phase: Phase;
  view: View;
  activeSection: SectionKey;
  /** Id of the last chat message; a new id means a new message arrived (TD-31). */
  lastMessageId?: string | null;
  /** The update diff card is open. */
  diffOpen?: boolean;
}

/** Separates the block name from a token that makes repeated targets (another new message) a new signal. */
export const FOCUS_TOKEN_SEPARATOR = '#';

/**
 * Which block of the conversation should be scrolled into view and given keyboard focus (TD-13, TD-31).
 * Pure: the component that owns the DOM does the scrolling and focusing, this only names the target.
 * `previous` is the input of the last render: a newly opened diff card and a newly arrived message win over the
 * phase-based target; otherwise the target follows phase / view / active section.
 */
export function focusKeyOf(input: ScrollInput, previous?: ScrollInput): string | null {
  const { phase, view, activeSection, lastMessageId = null, diffOpen = false } = input;
  if (diffOpen && !previous?.diffOpen) return 'update-diff';
  if (previous && lastMessageId !== null && lastMessageId !== (previous.lastMessageId ?? null) && phase === previous.phase) {
    return `message:last${FOCUS_TOKEN_SEPARATOR}${lastMessageId}`;
  }
  if (phase === 'saved') return diffOpen ? 'update-diff' : 'saved';
  if (phase === 'reviewing') return view === 'final' ? 'final' : `section:${activeSection}`;
  return null;
}

const same = (a: ScrollInput, b: ScrollInput) =>
  a.phase === b.phase &&
  a.view === b.view &&
  a.activeSection === b.activeSection &&
  (a.lastMessageId ?? null) === (b.lastMessageId ?? null) &&
  Boolean(a.diffOpen) === Boolean(b.diffOpen);

/** The focus signal; it changes only when the input changes (opening a session with history focuses the session, not a message). */
export function useChatScroll(input: ScrollInput): string | null {
  const [state, setState] = useState(() => ({ input, key: focusKeyOf(input) }));
  if (!same(state.input, input)) {
    const next = { input, key: focusKeyOf(input, state.input) };
    setState(next);
    return next.key;
  }
  return state.key;
}
