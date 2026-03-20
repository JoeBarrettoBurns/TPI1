// src/views/AuthView.jsx

import React, { useState, useCallback } from 'react';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { auth, GoogleAuthProvider, signInWithPopup } from '../firebase/config';
import { LogIn, CircleX } from 'lucide-react';

export const AuthView = ({
    authReady = true,
    accessDenied = false,
    deniedDetail = '',
    onClearAccessDenied,
}) => {
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleBackToSignIn = useCallback(() => {
        onClearAccessDenied?.();
        setError(null);
    }, [onClearAccessDenied]);

    const handleGoogleSignIn = useCallback(async () => {
        if (!authReady) return;
        setLoading(true);
        setError(null);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
                setError(null);
            } else {
                console.error(err);
                setError(err?.message || 'Sign-in failed.');
            }
        } finally {
            setLoading(false);
        }
    }, [authReady]);

    return (
        <div className="bg-zinc-900 min-h-screen flex items-center justify-center">
            <div className="w-full max-w-md">
                <div className="mb-4 rounded-xl border-0 bg-zinc-800 px-8 pb-8 pt-6 shadow-panel-sm">
                    {accessDenied ? (
                        <>
                            <div className="mb-8 text-center">
                                <CircleX
                                    className="mx-auto h-16 w-16 text-red-500"
                                    strokeWidth={1.75}
                                    aria-hidden
                                />
                                <h1 className="mt-6 text-2xl font-bold text-white">Access denied</h1>
                                <p className="mt-3 text-sm text-zinc-400">{deniedDetail}</p>
                            </div>
                            <Button
                                type="button"
                                onClick={handleBackToSignIn}
                                className="w-full flex items-center justify-center gap-2"
                            >
                                <LogIn className="h-5 w-5" aria-hidden />
                                Back to sign in
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="mb-8 text-center">
                                <img src="/tecnopan-logo.png" alt="TecnoPan Logo" className="h-20 w-auto mx-auto mb-4" />
                                <h1 className="text-3xl font-bold text-white">TecnoPan Inventory</h1>
                                <p className="mt-2 text-sm text-zinc-400">
                                    {authReady
                                        ? 'Sign in with your Google account to continue.'
                                        : 'Checking session…'}
                                </p>
                            </div>
                            {error && <ErrorMessage message={error} />}
                            <div className="mt-6">
                                <Button
                                    type="button"
                                    disabled={loading || !authReady}
                                    onClick={handleGoogleSignIn}
                                    className="w-full flex items-center justify-center gap-2"
                                >
                                    {!authReady ? (
                                        'Please wait…'
                                    ) : loading ? (
                                        'Signing in…'
                                    ) : (
                                        <>
                                            <LogIn className="h-5 w-5" aria-hidden />
                                            Continue with Google
                                        </>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
