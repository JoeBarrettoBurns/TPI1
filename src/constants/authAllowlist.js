/**
 * Who may sign in with Google (after Firebase accepts the Google account).
 *
 * 1) If ALLOWED_GOOGLE_EMAILS is non-empty → only those exact addresses (case-insensitive).
 *    Use this for one or a few specific accounts. Set ALLOWED_GOOGLE_EMAIL_DOMAINS to [].
 * 2) Else if ALLOWED_GOOGLE_EMAIL_DOMAINS is non-empty → any @domain address.
 * 3) If both are empty → any Google account (still not a substitute for Firestore security rules).
 */
export const ALLOWED_GOOGLE_EMAILS = [
    'joe.barrettoburns@gmail.com',
    'sahjin.ribeiro@gmail.com',
];

/** Ignored while ALLOWED_GOOGLE_EMAILS has at least one entry. */
export const ALLOWED_GOOGLE_EMAIL_DOMAINS = [];

export function isAllowlistEnabled() {
    return ALLOWED_GOOGLE_EMAILS.length > 0 || ALLOWED_GOOGLE_EMAIL_DOMAINS.length > 0;
}

export function isGoogleEmailAllowed(email) {
    if (!email) return false;
    const lower = email.toLowerCase().trim();

    if (ALLOWED_GOOGLE_EMAILS.length > 0) {
        const allowedSet = new Set(ALLOWED_GOOGLE_EMAILS.map((e) => e.toLowerCase().trim()));
        return allowedSet.has(lower);
    }

    if (ALLOWED_GOOGLE_EMAIL_DOMAINS.length === 0) return true;

    return ALLOWED_GOOGLE_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain.toLowerCase()}`));
}

export function getUnauthorizedMessage() {
    if (ALLOWED_GOOGLE_EMAILS.length > 0) {
        return 'This Google account is not authorized for this app.';
    }
    if (ALLOWED_GOOGLE_EMAIL_DOMAINS.length > 0) {
        return `Sign-in is limited to: ${ALLOWED_GOOGLE_EMAIL_DOMAINS.map((d) => `@${d}`).join(', ')}`;
    }
    return 'This account is not allowed to sign in.';
}
