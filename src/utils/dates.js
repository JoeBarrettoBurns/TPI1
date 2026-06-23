// src/utils/dates.js

/**
 * YYYY-MM-DD for a date-like value using LOCAL time (defaults to now).
 * Inventory documents store full ISO timestamps, but user-facing date fields
 * ("today" defaults, date inputs, dateReceived) must use the local calendar
 * date — `new Date().toISOString()` flips to tomorrow's date after ~5pm in
 * US timezones.
 */
export function localDateInputValue(dateLike = new Date()) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a date-like value to a local YYYY-MM-DD string.
 * A bare "YYYY-MM-DD" is treated as a LOCAL calendar date (NOT parsed through
 * `new Date()`, which would read it as UTC midnight and shift the day in
 * negative-offset timezones). Anything else (a Date or a full ISO timestamp)
 * is converted to its local calendar date.
 */
function toLocalYmd(dateLike) {
    // Reject null/undefined/empty explicitly: `new Date(null)` is the epoch (a
    // valid date), which would otherwise resolve to 1969/1970 instead of "no date".
    if (!dateLike) return '';
    if (typeof dateLike === 'string' && YMD_RE.test(dateLike)) return dateLike;
    return localDateInputValue(dateLike);
}

/**
 * A Date at LOCAL midnight (start of day) for the given calendar date, or null
 * if the input can't be resolved. Use for "is this day reached yet?" comparisons.
 */
export function parseLocalDate(dateLike) {
    const ymd = toLocalYmd(dateLike);
    if (!ymd) return null;
    return new Date(`${ymd}T00:00:00`);
}

/**
 * ISO timestamp for the START of the given calendar date in LOCAL time
 * (00:00:00). This is the boundary used for incoming stock: an order "arriving
 * on the 15th" becomes available at the start of the 15th.
 */
export function startOfDayIso(dateLike) {
    const ymd = toLocalYmd(dateLike);
    if (!ymd) return null;
    return new Date(`${ymd}T00:00:00`).toISOString();
}

/**
 * ISO timestamp for the END of the given calendar date in LOCAL time
 * (23:59:59). This is the boundary used for scheduled outgoing use: a use
 * "scheduled for the 15th" is fulfilled at the end of the 15th, which also
 * prevents a use created earlier the same day from firing immediately.
 */
export function endOfDayIso(dateLike) {
    const ymd = toLocalYmd(dateLike);
    if (!ymd) return null;
    return new Date(`${ymd}T23:59:59`).toISOString();
}
