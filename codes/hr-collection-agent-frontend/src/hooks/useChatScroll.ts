import type { Phase, View } from './model/SessionReducer';
import type { SectionKey } from './model/SectionConfig';

interface ScrollInput {
  phase: Phase;
  view: View;
  activeSection: SectionKey;
}

/**
 * Which block of the conversation should be scrolled into view and given keyboard focus (TD-13).
 * Pure: the component that owns the DOM does the scrolling and focusing, this only names the target.
 */
export function focusKeyOf({ phase, view, activeSection }: ScrollInput): string | null {
  if (phase === 'saved') return 'saved';
  if (phase === 'reviewing') return view === 'final' ? 'final' : `section:${activeSection}`;
  return null;
}

export function useChatScroll(input: ScrollInput): string | null {
  return focusKeyOf(input);
}
