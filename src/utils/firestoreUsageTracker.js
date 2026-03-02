// Firestore usage tracker - counts reads, writes, deletes for debug panel.
// Firestore free tier: 50k reads/day, 20k writes/day, 20k deletes/day.
// Counts reset daily (Pacific midnight). Persisted in localStorage.

const STORAGE_KEY = 'firestore_usage';
const DATE_KEY = 'firestore_usage_date';

// Firestore free tier limits (daily)
export const FIRESTORE_LIMITS = {
    reads: 50_000,
    writes: 20_000,
    deletes: 20_000,
};

function getDateKey() {
    const now = new Date();
    const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    return `${pacific.getFullYear()}-${String(pacific.getMonth() + 1).padStart(2, '0')}-${String(pacific.getDate()).padStart(2, '0')}`;
}

function load() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const storedDate = localStorage.getItem(DATE_KEY);
        const today = getDateKey();
        if (stored && storedDate === today) {
            const parsed = JSON.parse(stored);
            return { reads: parsed.reads || 0, writes: parsed.writes || 0, deletes: parsed.deletes || 0 };
        }
    } catch (_) {}
    return { reads: 0, writes: 0, deletes: 0 };
}

function save(stats) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        localStorage.setItem(DATE_KEY, getDateKey());
    } catch (_) {}
}

let state = load();
const listeners = new Set();

function notify() {
    listeners.forEach((fn) => fn(state));
}

export function recordRead(count = 1) {
    state = { ...state, reads: state.reads + count };
    save(state);
    notify();
}

export function recordWrite(count = 1) {
    state = { ...state, writes: state.writes + count };
    save(state);
    notify();
}

export function recordDelete(count = 1) {
    state = { ...state, deletes: state.deletes + count };
    save(state);
    notify();
}

export function getStats() {
    return { ...state };
}

export function resetDaily() {
    state = { reads: 0, writes: 0, deletes: 0 };
    save(state);
    notify();
}

export function subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
}
