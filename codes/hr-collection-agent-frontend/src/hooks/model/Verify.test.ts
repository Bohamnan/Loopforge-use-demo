import { describe, expect, it } from 'vitest';
import { sampleChatMessage, sampleSessionDetail, sampleSuggestion } from '../../test/ApiMocks';
import { cardStatus, decideAfterConfirmRead, decideAfterUpdateRead, matchSentMessage } from './Verify';

const u = (id: string, content: string) => sampleChatMessage('user', content, { message_id: id });
const a = (id: string) => sampleChatMessage('assistant', '回复', { message_id: id });

describe('matchSentMessage', () => {
  it('matches the tail pair that is new and carries the text', () => {
    const messages = [u('u1', '旧'), a('a1'), u('u2', '新'), a('a2')];
    expect(matchSentMessage(messages, ['u1', 'a1'], '新')?.user.message_id).toBe('u2');
  });

  it('does not match when the send did not reach the server (tail is old)', () => {
    expect(matchSentMessage([u('u1', '新'), a('a1')], ['u1', 'a1'], '新')).toBeNull();
  });

  it('tells an identical earlier message apart through knownIds, and rejects a missing reply or other text', () => {
    const messages = [u('u1', '同文'), a('a1'), u('u2', '同文'), a('a2')];
    expect(matchSentMessage(messages, ['u1', 'a1'], '同文')?.assistant.message_id).toBe('a2');
    expect(matchSentMessage([u('u2', '同文')], [], '同文')).toBeNull();
    expect(matchSentMessage([u('u2', '别的'), a('a2')], [], '同文')).toBeNull();
    expect(matchSentMessage([], [], '同文')).toBeNull();
  });
});

describe('decideAfter*Read (F-03: unreadable means not confirmed)', () => {
  it('confirm: saved (fresh or hit an existing record) vs still reviewing', () => {
    expect(decideAfterConfirmRead(sampleSessionDetail('saved'))).toEqual({ kind: 'saved', already: false });
    expect(decideAfterConfirmRead(sampleSessionDetail('pending'))).toEqual({ kind: 'saved', already: true });
    expect(decideAfterConfirmRead(sampleSessionDetail('reviewing'))).toEqual({ kind: 'still_reviewing' });
  });

  it('update: applied / pending / other', () => {
    expect(decideAfterUpdateRead(sampleSessionDetail('applied'))).toBe('applied');
    expect(decideAfterUpdateRead(sampleSessionDetail('pending'))).toBe('pending');
    expect(decideAfterUpdateRead(sampleSessionDetail('saved'))).toBe('other');
    expect(decideAfterUpdateRead(sampleSessionDetail('reviewing'))).toBe('other');
  });
});

describe('cardStatus', () => {
  const s = sampleSuggestion;
  it('summarises the four card states', () => {
    expect(cardStatus([s(), s({ status: 'applied' })])).toBe('pending');
    expect(cardStatus([s({ status: 'applied' }), s({ applicable: false, reason: 'invalid_format' })])).toBe('applied');
    expect(cardStatus([s({ status: 'cancelled' })])).toBe('cancelled');
    expect(cardStatus([s({ applicable: false, reason: 'too_long' })])).toBe('none');
  });
});
