// src/utils/optimisticCommit.ts
//
// Firestore runs with `persistentLocalCache`, so a batch commit applies to the
// local cache immediately — listeners fire and the UI updates — but the promise
// it returns only resolves once the SERVER acknowledges. On a slow or blocked
// connection that left submit buttons spinning on "Submitting…" indefinitely
// even though the write had already landed and would sync on its own.
//
// `commitOptimistically` waits a short while for the real acknowledgement and
// then lets the caller proceed, while still watching the original promise so a
// genuine failure is reported instead of disappearing.
//
// This is for BATCH writes only. `runTransaction` cannot complete offline by
// design, so the count-critical paths that consume stock keep awaiting their
// real result — a claim must never be reported as saved before the server
// agrees it happened.

/** How long to wait for a server acknowledgement before continuing optimistically. */
export const SERVER_ACK_GRACE_MS = 2500;

export interface OptimisticCommitOptions {
    /**
     * Called when the write ultimately FAILS after we already let the caller
     * proceed. This is the only place such a failure can still be reported.
     */
    onSyncError?: (error: any, label: string) => void;
    /** Human description of the write, used in the sync-failure message. */
    label?: string;
    timeoutMs?: number;
}

/**
 * Resolve as soon as the write is durable locally, rather than on server ack.
 *
 * Rejects normally if the commit fails within the grace period, so callers keep
 * showing errors for the common "permission denied"/"invalid data" cases.
 */
export function commitOptimistically(
    commit: () => Promise<any>,
    { onSyncError, label = 'change', timeoutMs = SERVER_ACK_GRACE_MS }: OptimisticCommitOptions = {}
): Promise<void> {
    let settled = false;
    let commitPromise: Promise<any>;

    // A synchronous throw from `commit()` is a real, immediate failure.
    try {
        commitPromise = commit();
    } catch (err) {
        return Promise.reject(err);
    }

    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve();
        }, timeoutMs);

        commitPromise.then(
            () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve();
            },
            (error: any) => {
                if (settled) {
                    // Already reported as done — the only way to surface this now.
                    onSyncError?.(error, label);
                    return;
                }
                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}
