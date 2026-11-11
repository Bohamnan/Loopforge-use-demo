import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_SESSION_ID, errorResponse, jsonResponse, sampleSessionDetail, stubFetch } from '../test/ApiMocks';
import { useResumeSession } from './useResumeSession';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useResumeSession.openSession (design 5.3 A)', () => {
  it.each([
    ['reviewing', 'reviewing'],
    ['saved', 'saved'],
  ] as const)('splits a %s session into the %s phase and reports activity only for writes', async (kind, phase) => {
    stubFetch(() => jsonResponse(200, sampleSessionDetail(kind)));
    const onActivity = vi.fn();
    const { result } = renderHook(() => useResumeSession({ onActivity }));
    act(() => result.current.openSession(SAMPLE_SESSION_ID));
    expect(result.current.state.busy).toBe('read');
    await waitFor(() => expect(result.current.state.phase).toBe(phase));
    expect(result.current.state.sessionId).toBe(SAMPLE_SESSION_ID);
    expect(onActivity).not.toHaveBeenCalled(); // reading does not refresh the list (TD-30)
  });

  it('session_not_found returns to the empty view with the session_gone notice and refreshes the list', async () => {
    stubFetch(() => errorResponse(404, { code: 'session_not_found' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onActivity = vi.fn();
    const { result } = renderHook(() => useResumeSession({ onActivity }));
    act(() => result.current.openSession(SAMPLE_SESSION_ID));
    await waitFor(() => expect(result.current.state.notice).toBe('session_gone'));
    expect(result.current.state.phase).toBe('empty');
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it('keeps the current view and shows a retryable error when the read fails otherwise', async () => {
    stubFetch(() => errorResponse(500, { code: 'internal_error' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useResumeSession());
    act(() => result.current.openSession(SAMPLE_SESSION_ID));
    await waitFor(() => expect(result.current.state.error?.scope).toBe('read'));
    expect(result.current.state.phase).toBe('empty');
    expect(result.current.state.busy).toBeNull();
  });
});
