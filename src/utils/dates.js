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
