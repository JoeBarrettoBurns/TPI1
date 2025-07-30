// src/views/AuthView.jsx

import React, { useState } from 'react';
import { FormInput } from '../components/common/FormInput';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';

// --- IMPORTANT ---
// Set your desired login credentials here.
const WHITELISTED_EMAIL = "jbb@tecnopan.ca";
const WHITELISTED_PASSWORD = "123456"; // Change this to your desired password

export const AuthView = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // A short delay to simulate a real login process
        setTimeout(() => {
            if (email.toLowerCase() === WHITELISTED_EMAIL && password === WHITELISTED_PASSWORD) {
                localStorage.setItem('isLoggedIn', 'true'); // Keep user logged in
                onLoginSuccess();
            } else {
                setError('Invalid email or password.');
                setLoading(false);
            }
        }, 500);
    };

    return (
        <div className="bg-slate-900 min-h-screen flex items-center justify-center">
            <div className="w-full max-w-md">
                <form
                    onSubmit={handleLogin}
                    className="bg-slate-800 shadow-lg rounded-xl px-8 pt-6 pb-8 mb-4 border border-slate-700"
                >
                    <div className="mb-8 text-center">
                        <img src="/tecnopan-logo.png" alt="TecnoPan Logo" className="h-20 w-auto mx-auto mb-4" />
                        <h1 className="text-3xl font-bold text-white">TecnoPan Inventory</h1>
                    </div>
                    <div className="mb-4">
                        <FormInput
                            label="Email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <FormInput
                            label="Password"
                            name="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="******************"
                            required
                        />
                    </div>
                    {error && <ErrorMessage message={error} />}
                    <div className="flex items-center justify-between mt-6">
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? 'Signing In...' : 'Sign In'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};