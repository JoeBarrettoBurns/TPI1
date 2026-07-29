// src/utils/optimisticCommit.test.js
//
// The contract: never block the UI on a server round trip that the offline cache
// has already satisfied, but never lose a real failure either.

import { commitOptimistically, SERVER_ACK_GRACE_MS } from './optimisticCommit';

// Drain the microtask queue. Fake timers do not patch promises, so a few turns
// are enough to let the commit's .then handlers run.
const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

test('resolves immediately when the server acknowledges quickly', async () => {
    const settled = jest.fn();
    const promise = commitOptimistically(() => Promise.resolve()).then(settled);

    await flush();
    expect(settled).toHaveBeenCalled();
    await promise;
});

test('resolves after the grace period when the server never answers', async () => {
    const settled = jest.fn();
    const promise = commitOptimistically(() => new Promise(() => {})).then(settled);

    await flush();
    expect(settled).not.toHaveBeenCalled(); // still waiting for the real ack

    jest.advanceTimersByTime(SERVER_ACK_GRACE_MS);
    await flush();
    expect(settled).toHaveBeenCalled();
    await promise;
});

test('rejects when the write fails within the grace period', async () => {
    const error = new Error('Missing or insufficient permissions.');
    const caught = jest.fn();

    const promise = commitOptimistically(() => Promise.reject(error)).catch(caught);
    await flush();

    expect(caught).toHaveBeenCalledWith(error);
    await promise;
});

test('reports a failure that arrives after the caller already moved on', async () => {
    const error = new Error('network down');
    const onSyncError = jest.fn();
    let rejectCommit;

    const promise = commitOptimistically(() => new Promise((_, reject) => { rejectCommit = reject; }), {
        onSyncError,
        label: 'stock order',
    });

    jest.advanceTimersByTime(SERVER_ACK_GRACE_MS);
    await flush();
    await promise; // caller proceeded

    rejectCommit(error);
    await flush();

    expect(onSyncError).toHaveBeenCalledWith(error, 'stock order');
});

test('a late success after the grace period reports nothing', async () => {
    const onSyncError = jest.fn();
    let resolveCommit;

    const promise = commitOptimistically(() => new Promise((resolve) => { resolveCommit = resolve; }), { onSyncError });
    jest.advanceTimersByTime(SERVER_ACK_GRACE_MS);
    await flush();
    await promise;

    resolveCommit();
    await flush();

    expect(onSyncError).not.toHaveBeenCalled();
});

test('a synchronous throw is surfaced, not swallowed', async () => {
    const caught = jest.fn();
    await commitOptimistically(() => { throw new Error('bad batch'); }).catch(caught);

    expect(caught).toHaveBeenCalled();
    expect(caught.mock.calls[0][0].message).toBe('bad batch');
});
