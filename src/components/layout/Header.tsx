// src/components/layout/Header.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Edit, Box, Users, LogOut, Database, Mail, Shield, Settings, FlaskConical } from 'lucide-react';
import { Button } from '../common/Button';

// Experimental Features toggle. This is the TypeScript build.
// Flipping the toggle sends the user to the JavaScript build:
//  - local dev: the JS dev server on the other port (:3001)
//  - deployed (Netlify): the URL in REACT_APP_OTHER_VERSION_URL (the JS site)
const IS_TS = true;
const OTHER_VERSION_PORT = '3001';
const OTHER_VERSION_URL = process.env.REACT_APP_OTHER_VERSION_URL || '';

export const Header = ({
    onAdd,
    onBuy,
    onUse,
    onEdit,
    isEditMode,
    onManageCategories,
    onManageSuppliers,
    onOpenBackup,
    onOpenAuthentication,
    onSignOut
}: any) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const moreMenuRef = useRef<any>(null);

    useEffect(() => {
        const handleDocPointerDown = (event: any) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handleDocPointerDown);
        return () => document.removeEventListener('mousedown', handleDocPointerDown);
    }, []);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMoreOpen(false);
            }
        };
        if (moreOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
        return undefined;
    }, [moreOpen]);

    const menuItemClass =
        'w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-700 transition-colors';

    const switchVersion = () => {
        setMoreOpen(false);
        const { protocol, hostname } = window.location;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const target = (!isLocalhost && OTHER_VERSION_URL)
            ? OTHER_VERSION_URL
            : `${protocol}//${hostname}:${OTHER_VERSION_PORT}`;
        window.location.href = target;
    };

    return (
        // Just the buttons row. The parent sticky wrapper (in App.jsx) provides
        // the pinned positioning and the shared frosted backdrop, and on large
        // screens places this row to the right of the view tabs. pointer-events
        // are re-enabled here so the wrapper's fade zone never swallows clicks.
        <header>
            <div className="pointer-events-auto flex w-full flex-nowrap items-stretch gap-2">
                <Button onClick={onAdd} className="flex-1 min-w-0 !py-2 !bg-blue-800/70 hover:!bg-blue-700/70 text-sm md:text-base"><Plus size={18} className="shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">Add Stock</span></Button>
                <Button onClick={onBuy} variant="secondary" className="flex-none whitespace-nowrap !px-4 !py-2 !bg-zinc-700/60 hover:!bg-zinc-600/70 text-sm md:text-base">
                    <span className="hidden sm:inline whitespace-nowrap">Email Suppliers</span>
                </Button>
                <Button onClick={onUse} variant="secondary" className="flex-1 min-w-0 !py-2 !bg-zinc-700/50 hover:!bg-zinc-600/70 text-sm md:text-base"><Minus size={18} className="shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">Use Stock</span></Button>
                <Button onClick={onEdit} variant={isEditMode ? 'success' : 'warning'} className={`flex-1 min-w-0 !py-2 text-sm md:text-base ${isEditMode ? '!bg-green-600/60 hover:!bg-green-500/70' : '!bg-amber-600/60 hover:!bg-amber-500/70'}`}>
                    <Edit size={18} className="shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">{isEditMode ? 'Finish' : 'Edit'}</span>
                </Button>

                <div className="relative flex-1 min-w-0" ref={moreMenuRef}>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full !py-2 !bg-zinc-700/50 hover:!bg-zinc-600/70 text-sm md:text-base"
                        aria-expanded={moreOpen}
                        aria-haspopup="menu"
                        aria-label={moreOpen ? 'Close settings menu' : 'Open settings menu'}
                        onClick={() => setMoreOpen((o) => !o)}
                    >
                        <Settings size={18} className="shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">Settings</span>
                    </Button>
                    {moreOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 z-50 mt-2 min-w-[14rem] rounded-xl border border-zinc-600 bg-zinc-800 py-1 shadow-xl"
                        >
                            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { onManageCategories(); setMoreOpen(false); }}>
                                <Box size={18} className="shrink-0 text-zinc-400" />
                                <span>Manage Categories</span>
                            </button>
                            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { onManageSuppliers(); setMoreOpen(false); }}>
                                <Users size={18} className="shrink-0 text-zinc-400" />
                                <span>Manage Suppliers</span>
                            </button>
                            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { onOpenAuthentication(); setMoreOpen(false); }}>
                                <Shield size={18} className="shrink-0 text-zinc-400" />
                                <span>Authentication</span>
                            </button>
                            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { onOpenBackup(); setMoreOpen(false); }}>
                                <Database size={18} className="shrink-0 text-zinc-400" />
                                <span>Backups</span>
                            </button>
                            <div className="my-1 border-t border-zinc-700" role="separator" />
                            <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={IS_TS}
                                className={`${menuItemClass} justify-between`}
                                onClick={switchVersion}
                            >
                                <span className="flex items-center gap-2">
                                    <FlaskConical size={18} className="shrink-0 text-zinc-400" />
                                    <span className="flex flex-col">
                                        <span>Experimental Features</span>
                                        <span className="text-xs text-zinc-500">{IS_TS ? 'On · TypeScript build' : 'Off · JavaScript build'}</span>
                                    </span>
                                </span>
                                <span
                                    aria-hidden="true"
                                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${IS_TS ? 'bg-blue-600' : 'bg-zinc-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${IS_TS ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                </span>
                            </button>
                            <div className="my-1 border-t border-zinc-700" role="separator" />
                            <button type="button" role="menuitem" className={`${menuItemClass} text-red-300 hover:bg-red-950/50`} onClick={() => { onSignOut(); setMoreOpen(false); }}>
                                <LogOut size={18} className="shrink-0" />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

Header.displayName = 'Header';
