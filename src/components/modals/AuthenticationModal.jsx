// Email/password provisioning uses firebase/auth with a secondary Auth instance so the admin session is preserved.
// https://firebase.google.com/docs/auth/web/password-auth

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';
import { FormInput } from '../common/FormInput';
import { ErrorMessage } from '../common/ErrorMessage';
import {
    createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
    signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc } from '../../firebase/firestoreWithTracking';
import { auth, db, appId, secondaryAuth } from '../../firebase/config';
import {
    FALLBACK_ALLOWED_EMAILS,
    normalizeEmail,
    isValidEmailFormat,
    getFirebaseEmailAuthErrorMessage,
} from '../../constants/authAllowlist';
import { Mail, Shield, Trash2, UserPlus } from 'lucide-react';

const ALLOWLIST_REF = doc(db, `artifacts/${appId}/config/access_allowlist`);

function buildMergedAllowlistRows(firestoreEmails) {
    const map = new Map();
    for (const raw of FALLBACK_ALLOWED_EMAILS) {
        const k = normalizeEmail(raw);
        if (!k) continue;
        map.set(k, { key: k, display: raw.trim(), inFallback: true, inFirestore: false });
    }
    for (const raw of firestoreEmails) {
        const k = normalizeEmail(raw);
        if (!k) continue;
        const prev = map.get(k);
        if (prev) {
            map.set(k, { ...prev, display: raw.trim(), inFirestore: true });
        } else {
            map.set(k, { key: k, display: raw.trim(), inFallback: false, inFirestore: true });
        }
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export const AuthenticationModal = ({ onClose }) => {
    const [emails, setEmails] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [newEmail, setNewEmail] = useState('');
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [pwEmail, setPwEmail] = useState('');
    const [pwNew, setPwNew] = useState('');
    const [pwConfirm, setPwConfirm] = useState('');
    const [creatingPw, setCreatingPw] = useState(false);

    const [methodsByEmail, setMethodsByEmail] = useState({});
    const [methodsLoading, setMethodsLoading] = useState(false);

    const mergedAllowlistRows = useMemo(() => buildMergedAllowlistRows(emails), [emails]);

    const allSignInMethodsEmpty = useMemo(() => {
        if (methodsLoading || mergedAllowlistRows.length === 0) return false;
        return mergedAllowlistRows.every((row) => {
            const m = methodsByEmail[row.key];
            return Array.isArray(m) && m.length === 0;
        });
    }, [methodsLoading, mergedAllowlistRows, methodsByEmail]);

    const provisionEmailOnAllowlist = useMemo(() => {
        const n = normalizeEmail(pwEmail);
        return n && mergedAllowlistRows.some((r) => r.key === n);
    }, [pwEmail, mergedAllowlistRows]);

    useEffect(() => {
        const unsub = onSnapshot(
            ALLOWLIST_REF,
            (snap) => {
                setLoadError(null);
                const raw = snap.data()?.emails;
                if (Array.isArray(raw)) {
                    const normalized = [...new Set(raw.map((e) => normalizeEmail(String(e))).filter(Boolean))];
                    const casingMismatch = raw.some(
                        (e) => normalizeEmail(String(e)) !== String(e).trim()
                    );
                    if (casingMismatch && normalized.length > 0) {
                        setDoc(
                            ALLOWLIST_REF,
                            { emails: normalized, updatedAt: new Date().toISOString() },
                            { merge: true }
                        ).catch((e) => console.warn('Allowlist casing normalize:', e));
                    }
                    setEmails(normalized);
                } else {
                    setEmails([]);
                }
                setLoadingList(false);
            },
            (err) => {
                console.error(err);
                const code = err?.code || '';
                const hint =
                    code === 'permission-denied'
                        ? ' Deploy Firestore rules from this project. Run: firebase deploy --only firestore:rules'
                        : '';
                setLoadError(
                    code === 'permission-denied'
                        ? `Permission denied while loading the allowlist.${hint}`
                        : 'Could not load the allowlist. Check your connection and try again.'
                );
                setLoadingList(false);
            }
        );
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!mergedAllowlistRows.length) {
            setMethodsByEmail({});
            return;
        }
        let cancelled = false;
        setMethodsLoading(true);
        (async () => {
            const next = {};
            for (const row of mergedAllowlistRows) {
                const key = row.key;
                try {
                    const m = await fetchSignInMethodsForEmail(auth, key);
                    if (!cancelled) next[key] = m;
                } catch (err) {
                    console.warn('fetchSignInMethodsForEmail', key, err);
                    if (!cancelled) next[key] = [];
                }
            }
            if (!cancelled) {
                setMethodsByEmail(next);
                setMethodsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mergedAllowlistRows]);

    const persistEmails = useCallback(async (nextList) => {
        const normalized = [...new Set(nextList.map((e) => normalizeEmail(String(e))).filter(Boolean))];
        setSaving(true);
        setError('');
        try {
            await setDoc(ALLOWLIST_REF, { emails: normalized, updatedAt: new Date().toISOString() }, { merge: true });
            return true;
        } catch (e) {
            console.error(e);
            setError(e?.message || 'Failed to save allowlist.');
            return false;
        } finally {
            setSaving(false);
        }
    }, []);

    const handleAddEmail = async () => {
        const n = normalizeEmail(newEmail);
        if (!n) {
            setError('Enter a valid email.');
            return;
        }
        if (!isValidEmailFormat(n)) {
            setError('Use a full address like name@company.com.');
            return;
        }
        if (mergedAllowlistRows.some((r) => r.key === n)) {
            setError('That email is already on the list.');
            return;
        }
        const ok = await persistEmails([...emails, n]);
        if (ok) setNewEmail('');
    };

    const handleRemove = async (removeAddr, inFirestore) => {
        const n = normalizeEmail(removeAddr);
        if (!inFirestore) return;
        const next = emails.filter((e) => normalizeEmail(e) !== n);
        await persistEmails(next);
    };

    const handleCreateEmailPasswordUser = async () => {
        const emailNorm = normalizeEmail(pwEmail);
        if (!emailNorm) {
            setError('Enter the account email.');
            return;
        }
        if (!isValidEmailFormat(emailNorm)) {
            setError('Use a full email address (name@domain.com).');
            return;
        }
        if (pwNew.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (pwNew !== pwConfirm) {
            setError('Passwords do not match.');
            return;
        }
        setCreatingPw(true);
        setError('');
        try {
            const onAllowlist = mergedAllowlistRows.some((r) => r.key === emailNorm);
            if (!onAllowlist) {
                const ok = await persistEmails([...emails, emailNorm]);
                if (!ok) return;
            }
            await createUserWithEmailAndPassword(secondaryAuth, emailNorm, pwNew);
            await firebaseSignOut(secondaryAuth);
            setPwEmail('');
            setPwNew('');
            setPwConfirm('');
            try {
                const m = await fetchSignInMethodsForEmail(auth, emailNorm);
                setMethodsByEmail((prev) => ({ ...prev, [emailNorm]: m }));
            } catch {
                /* ignore */
            }
        } catch (error) {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error('createUserWithEmailAndPassword:', errorCode, errorMessage);
            setError(getFirebaseEmailAuthErrorMessage(error));
        } finally {
            setCreatingPw(false);
        }
    };

    return (
        <BaseModal title="Access & sign-in" onClose={onClose} maxWidthClass="max-w-xl">
            <div className="space-y-6 text-sm text-zinc-400 leading-relaxed mb-6">
                <p>
                    <strong className="text-zinc-200">Google (e.g. Gmail):</strong> add the exact email below. They sign
                    in with <span className="text-zinc-300">Continue with Google</span> on the login page — no password
                    needed here.
                </p>
                <p>
                    <strong className="text-zinc-200">Email + password:</strong> use the section below — if the address
                    isn’t on the allowlist yet, creating the account adds it automatically.
                </p>
                <p className="text-xs text-zinc-500 border-l-2 border-zinc-600 pl-3">
                    This list is who is <em>allowed</em> in this app. Every Firebase account in the project (disabled
                    users, etc.) is under{' '}
                    <span className="text-zinc-400">Firebase Console → Authentication → Users</span>.
                </p>
            </div>

            {loadError && (
                <div
                    className="mb-6 rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100/95"
                    role="status"
                >
                    <p className="font-semibold text-amber-200/95 mb-1">Allowlist unavailable</p>
                    <p className="text-amber-100/90 leading-relaxed">{loadError}</p>
                </div>
            )}
            {error && <ErrorMessage message={error} />}

            {/* Allowlist + unified roster */}
            <div className="mb-8">
                <h4 className="text-white font-semibold text-base mb-1 flex items-center gap-2">
                    <Shield size={18} className="shrink-0 text-zinc-400" aria-hidden />
                    Allowed emails (who can open the app)
                </h4>
                <p className="text-xs text-zinc-500 mb-3">
                    Firestore entries can be removed here. “Rule fallback” addresses are also in{' '}
                    <code className="text-zinc-500">firestore.rules</code> — change the code/rules to remove those.
                </p>

                {loadingList ? (
                    <p className="text-zinc-500 text-sm py-4">Loading…</p>
                ) : !loadError && mergedAllowlistRows.length === 0 ? (
                    <p className="text-zinc-500 text-sm mb-4">No addresses yet. Add one below.</p>
                ) : !loadError ? (
                    <div className="rounded-lg border border-zinc-700 overflow-hidden mb-4">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,auto)_minmax(5.5rem,auto)_2.5rem] gap-x-2 bg-zinc-800/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-700">
                            <span>Email</span>
                            <span className="text-center">Source</span>
                            <span className="text-right">Sign-in</span>
                            <span className="sr-only">Remove</span>
                        </div>
                        <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-700/80">
                            {mergedAllowlistRows.map((row) => {
                                const key = row.key;
                                const methods = methodsByEmail[key];
                                const hasPassword = Array.isArray(methods) && methods.includes('password');
                                const hasGoogle = Array.isArray(methods) && methods.includes('google.com');
                                const noMethods = Array.isArray(methods) && methods.length === 0;

                                let signInLabel = '—';
                                if (methodsLoading) {
                                    signInLabel = '…';
                                } else if (!noMethods) {
                                    const parts = [];
                                    if (hasGoogle) parts.push('Google');
                                    if (hasPassword) parts.push('Password');
                                    signInLabel = parts.join(' · ') || '—';
                                } else if (allSignInMethodsEmpty) {
                                    signInLabel = 'Unknown';
                                } else {
                                    signInLabel = 'Not set up';
                                }

                                return (
                                    <li
                                        key={key}
                                        className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,auto)_minmax(5.5rem,auto)_2.5rem] gap-x-2 items-center px-3 py-2.5 bg-zinc-900/40 text-xs"
                                    >
                                        <span className="font-mono text-zinc-200 break-all min-w-0">{row.display}</span>
                                        <span className="text-zinc-500 text-center whitespace-nowrap text-[11px]">
                                            {row.inFallback && row.inFirestore ? (
                                                <span title="In rules and Firestore">Both</span>
                                            ) : row.inFallback ? (
                                                <span title="Server rules only">Rules</span>
                                            ) : (
                                                <span>DB</span>
                                            )}
                                        </span>
                                        <span
                                            className={`text-right whitespace-nowrap text-[11px] ${
                                                signInLabel === 'Unknown' || signInLabel === 'Not set up'
                                                    ? 'text-amber-400/90'
                                                    : 'text-zinc-400'
                                            }`}
                                            title={
                                                signInLabel === 'Unknown'
                                                    ? 'Firebase may hide methods (email enumeration protection). Check Console → Authentication → Users.'
                                                    : undefined
                                            }
                                        >
                                            {signInLabel}
                                        </span>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => handleRemove(row.display, row.inFirestore)}
                                                disabled={saving || !row.inFirestore}
                                                title={
                                                    row.inFirestore
                                                        ? 'Remove from Firestore'
                                                        : 'Only in server rules'
                                                }
                                                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-25 disabled:hover:text-zinc-500"
                                                aria-label={
                                                    row.inFirestore ? `Remove ${row.display}` : 'Cannot remove from rules'
                                                }
                                            >
                                                <Trash2 size={16} aria-hidden />
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}

                {allSignInMethodsEmpty && !methodsLoading && mergedAllowlistRows.length > 0 && (
                    <p className="text-xs text-amber-200/90 bg-amber-950/35 border border-amber-800/50 rounded-md px-3 py-2 mb-4">
                        Sign-in column shows “Unknown” when Firebase hides registration info. Open{' '}
                        <strong className="font-medium text-amber-100/95">Authentication → Users</strong> in the
                        console to see Google vs password, or disable email enumeration protection under Authentication →
                        Settings.
                    </p>
                )}

                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 min-w-0">
                        <FormInput
                            name="allowlist-new-email"
                            label="Add email"
                            type="email"
                            placeholder="colleague@gmail.com or name@company.com"
                            value={newEmail}
                            onChange={(ev) => setNewEmail(ev.target.value)}
                            disabled={!!loadError}
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={handleAddEmail}
                        disabled={saving || loadingList || !!loadError}
                        className="w-full sm:w-auto shrink-0 px-6 py-2.5 min-h-[42px]"
                    >
                        Add to list
                    </Button>
                </div>
            </div>

            {/* Email/password provisioning */}
            <div className="border-t border-zinc-700 pt-8">
                <h4 className="text-white font-semibold text-base mb-1 flex items-center gap-2">
                    <UserPlus size={18} className="shrink-0 text-zinc-400" aria-hidden />
                    Create email / password account
                </h4>
                <p className="text-xs text-zinc-500 mb-4">
                    For people who will use <strong className="text-zinc-400 font-medium">email + password</strong> on the
                    login page (e.g. company addresses). Gmail users usually choose <span className="text-zinc-400">Continue with Google</span> instead — use this only when they need a password. If the email isn’t allowlisted yet, the button saves it to the list and then creates the Firebase user. Enable Email/Password under Firebase → Authentication → Sign-in method.
                </p>
                <div className="space-y-3 max-w-md">
                    <FormInput
                        name="auth-provision-email"
                        type="email"
                        label="Email"
                        value={pwEmail}
                        onChange={(ev) => setPwEmail(ev.target.value)}
                        autoComplete="off"
                        disabled={!!loadError}
                    />
                    <FormInput
                        name="auth-provision-password"
                        type="password"
                        label="Password"
                        value={pwNew}
                        onChange={(ev) => setPwNew(ev.target.value)}
                        autoComplete="new-password"
                        disabled={!!loadError}
                    />
                    <FormInput
                        name="auth-provision-password-confirm"
                        type="password"
                        label="Confirm password"
                        value={pwConfirm}
                        onChange={(ev) => setPwConfirm(ev.target.value)}
                        autoComplete="new-password"
                        disabled={!!loadError}
                    />
                    <Button
                        type="button"
                        variant="primary"
                        onClick={handleCreateEmailPasswordUser}
                        disabled={creatingPw || saving || !!loadError}
                        className="w-full mt-2 py-2.5"
                    >
                        {creatingPw
                            ? 'Please wait…'
                            : provisionEmailOnAllowlist
                              ? 'Create Firebase user'
                              : 'Add to allowlist & create user'}
                    </Button>
                </div>
            </div>

            <p className="mt-8 flex items-start gap-2 text-xs text-zinc-600 border-t border-zinc-800 pt-6">
                <Mail size={14} className="shrink-0 mt-0.5 opacity-70" aria-hidden />
                <span>
                    To see <strong className="text-zinc-500 font-medium">every</strong> account Firebase knows about
                    (not just this allowlist), use the console: Authentication → Users.
                </span>
            </p>
        </BaseModal>
    );
};
