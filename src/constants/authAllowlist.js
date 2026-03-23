/**
 * Fallback allowlist when Firestore `artifacts/{appId}/config/access_allowlist` is missing
 * or has an empty `emails` array. Must stay in sync with fallbackStaffEmails() in firestore.rules.
 *
 * Live allowlist is stored in Firestore and can be edited in the app (Authentication).
 */
export const FALLBACK_ALLOWED_EMAILS = [
    'joe.barrettoburns@gmail.com',
    'sahjin.ribeiro@gmail.com',
];

/**
 * @deprecated Use isEmailAllowed with a list from Firestore (or FALLBACK_ALLOWED_EMAILS).
 * Kept for any code that still expects the old Google-only helpers.
 */
export const ALLOWED_GOOGLE_EMAILS = FALLBACK_ALLOWED_EMAILS;

/** Ignored while ALLOWED_GOOGLE_EMAILS has at least one entry. */
export const ALLOWED_GOOGLE_EMAIL_DOMAINS = [];

export function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';
    return email.toLowerCase().trim();
}

/**
 * Firebase Email/Password only accepts real email addresses (not arbitrary usernames).
 * Use this before saving to the allowlist or calling createUserWithEmailAndPassword.
 */
export function isValidEmailFormat(email) {
    const s = normalizeEmail(email);
    if (!s || s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** User-facing copy for common Firebase Auth errors on email/password flows. */
export function getFirebaseEmailAuthErrorMessage(error) {
    const code = error?.code;
    if (code === 'auth/operation-not-allowed') {
        return 'Email/password sign-in is turned off for this Firebase project. Open Firebase Console → Authentication → Sign-in method → enable Email/Password.';
    }
    if (code === 'auth/invalid-email') {
        return 'That is not a valid email address. Use a normal address like name@company.com — Firebase does not support username-only accounts for email/password.';
    }
    if (code === 'auth/weak-password') {
        return 'Password is too weak. Choose a stronger password.';
    }
    if (code === 'auth/email-already-in-use') {
        return 'That email already has an account. Use Sign in or reset the password in the Firebase console.';
    }
    if (code === 'auth/user-disabled') {
        return 'This account has been disabled in Firebase.';
    }
    if (code === 'auth/user-not-found') {
        return 'No Firebase account exists for that email. Create it under Authentication → Create Firebase user and password.';
    }
    return error?.message || 'Authentication failed.';
}

/**
 * Gmail and googlemail.com are the same mailbox; allowlist may list either form.
 * @param {string} normalizedLower — output of normalizeEmail()
 */
function gmailEquivalentAddresses(normalizedLower) {
    if (!normalizedLower) return [];
    if (normalizedLower.endsWith('@googlemail.com')) {
        const local = normalizedLower.slice(0, -'@googlemail.com'.length);
        return [normalizedLower, `${local}@gmail.com`];
    }
    if (normalizedLower.endsWith('@gmail.com')) {
        const local = normalizedLower.slice(0, -'@gmail.com'.length);
        return [normalizedLower, `${local}@googlemail.com`];
    }
    return [normalizedLower];
}

/** @param {string[]} allowedLowercased — emails already lowercased */
export function isEmailAllowed(email, allowedLowercased) {
    const lower = normalizeEmail(email);
    if (!lower) return false;
    for (const addr of gmailEquivalentAddresses(lower)) {
        if (allowedLowercased.includes(addr)) return true;
    }
    return false;
}

/**
 * Prefer Firebase Auth user.email; also check providerData (Google sometimes differs from primary).
 * @param {object | null} user — Firebase User
 * @param {string[]} allowedLowercased
 */
export function isFirebaseUserAllowed(user, allowedLowercased) {
    if (!user) return false;
    const candidates = [];
    if (user.email) candidates.push(normalizeEmail(user.email));
    for (const p of user.providerData || []) {
        if (p?.email) candidates.push(normalizeEmail(p.email));
    }
    const unique = [...new Set(candidates.filter(Boolean))];
    for (const c of unique) {
        if (isEmailAllowed(c, allowedLowercased)) return true;
    }
    return false;
}

export function getUnauthorizedMessage() {
    return 'This account is not authorized for this app.';
}
