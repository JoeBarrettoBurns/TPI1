import { localDateInputValue } from './dates';

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
