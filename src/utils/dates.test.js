import { localDateInputValue, parseLocalDate, startOfDayIso, endOfDayIso } from './dates';

describe('localDateInputValue', () => {
    it('formats a Date using local calendar components', () => {
        const d = new Date(2026, 5, 11, 23, 30); // June 11, 2026 11:30pm local
        expect(localDateInputValue(d)).toBe('2026-06-11');
    });

    it('round-trips a local-midnight ISO string to the same date', () => {
        const iso = new Date(2026, 0, 2, 0, 0).toISOString();
        expect(localDateInputValue(iso)).toBe('2026-01-02');
    });

    it('pads single-digit months and days', () => {
        expect(localDateInputValue(new Date(2026, 2, 5))).toBe('2026-03-05');
    });

    it('returns empty string for unparseable input', () => {
        expect(localDateInputValue('not-a-date')).toBe('');
    });

    it('defaults to today', () => {
        expect(localDateInputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('day-boundary helpers', () => {
    it('parseLocalDate treats a bare YYYY-MM-DD as local midnight (no day shift)', () => {
        const d = parseLocalDate('2026-07-15');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(6); // July
        expect(d.getDate()).toBe(15);
        expect(d.getHours()).toBe(0);
        expect(d.getMinutes()).toBe(0);
    });

    it('startOfDayIso and endOfDayIso bound the same local calendar day', () => {
        const start = startOfDayIso('2026-07-15');
        const end = endOfDayIso('2026-07-15');
        // Both must map back to the same local date they were built from.
        expect(localDateInputValue(start)).toBe('2026-07-15');
        expect(localDateInputValue(end)).toBe('2026-07-15');
        // End of day is strictly later than start of day.
        expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
    });

    it('endOfDayIso for a calendar date is in the future relative to that morning', () => {
        // A use scheduled for today must not be "due" at the start of the day.
        const today = localDateInputValue(new Date());
        const morning = new Date(`${today}T00:00:01`);
        expect(new Date(endOfDayIso(today)).getTime()).toBeGreaterThan(morning.getTime());
    });

    it('accepts a full ISO timestamp and uses its local calendar date', () => {
        const iso = new Date(2026, 0, 2, 8, 30).toISOString(); // Jan 2 2026 local
        expect(localDateInputValue(startOfDayIso(iso))).toBe('2026-01-02');
        expect(localDateInputValue(endOfDayIso(iso))).toBe('2026-01-02');
    });

    it('returns null for unresolvable input', () => {
        expect(parseLocalDate('')).toBeNull();
        expect(startOfDayIso(null)).toBeNull();
        expect(endOfDayIso('not-a-date')).toBeNull();
    });
});
