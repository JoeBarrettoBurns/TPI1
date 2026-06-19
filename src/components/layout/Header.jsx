// src/components/layout/Header.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Edit, Box, Users, LogOut, Database, ShoppingCart, Shield, Settings } from 'lucide-react';
import { Button } from '../common/Button';

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
}) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const moreMenuRef = useRef(null);

    useEffect(() => {
        const handleDocPointerDown = (event) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handleDocPointerDown);
        return () => document.removeEventListener('mousedown', handleDocPointerDown);
    }, []);

    useEffect(() => {
        const handleEscape = (event) => {
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

    return (
        // Just the buttons row. The parent sticky wrapper (in App.jsx) provides
        // the pinned positioning and the shared frosted backdrop, and on large
        // screens places this row to the right of the view tabs. pointer-events
        // are re-enabled here so the wrapper's fade zone never swallows clicks.
        <header>
            <div className="pointer-events-auto flex w-full flex-nowrap items-stretch gap-2">
                <Button onClick={onAdd} className="flex-1 min-w-0 text-sm md:text-base"><Plus size={18} /> <span className="hidden sm:inline">Add Stock</span></Button>
                <Button onClick={onBuy} variant="secondary" className="flex-1 min-w-0 text-sm md:text-base">
                    <ShoppingCart size={18} /> <span className="hidden sm:inline">Buy</span>
                </Button>
                <Button onClick={onUse} variant="secondary" className="flex-1 min-w-0 text-sm md:text-base"><Minus size={18} /> <span className="hidden sm:inline">Use Stock</span></Button>
                <Button onClick={onEdit} variant={isEditMode ? 'success' : 'warning'} className="flex-1 min-w-0 text-sm md:text-base">
                    <Edit size={18} /> <span className="hidden sm:inline">{isEditMode ? 'Finish Editing' : 'Edit'}</span>
                </Button>

                <div className="relative flex-1 min-w-0" ref={moreMenuRef}>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full text-sm md:text-base"
                        aria-expanded={moreOpen}
                        aria-haspopup="menu"
                        aria-label={moreOpen ? 'Close settings menu' : 'Open settings menu'}
                        onClick={() => setMoreOpen((o) => !o)}
                    >
                        <Settings size={18} />
                        <span className="hidden sm:inline">Settings</span>
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
