// src/components/layout/Header.jsx

import React, { forwardRef, useState, useRef, useEffect } from 'react';
import { Plus, Minus, Edit, Box, Users, LogOut, Database, ShoppingCart, Shield, Settings } from 'lucide-react';
import { Button } from '../common/Button';

export const Header = forwardRef(({
    searchQuery,
    onSearchChange,
    onKeyDown,
    onAdd,
    onBuy,
    onUse,
    onEdit,
    isEditMode,
    onManageCategories,
    onManageSuppliers,
    onOpenBackup,
    onOpenAuthentication,
    onSignOut,
    onLogoClick
}, ref) => {
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
        <header className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <img src="/tecnopan-logo.png" alt="TecnoPan Logo" onClick={onLogoClick} className="h-12 md:h-16 w-auto cursor-pointer" />
                    <h1 onClick={onLogoClick} className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center sm:text-left cursor-pointer">TecnoPan Inventory</h1>
                </div>
                <div className="flex flex-wrap justify-center md:justify-end gap-2">
                    <Button onClick={onAdd} className="px-3 py-2 md:px-5 md:py-3"><Plus size={20} /> <span className="hidden sm:inline">Add Stock</span></Button>
                    <Button onClick={onBuy} variant="secondary" className="px-3 py-2 md:px-5 md:py-3">
                        <ShoppingCart size={20} /> <span className="hidden sm:inline">Buy</span>
                    </Button>
                    <Button onClick={onUse} variant="secondary" className="px-3 py-2 md:px-5 md:py-3"><Minus size={20} /> <span className="hidden sm:inline">Use Stock</span></Button>
                    <Button onClick={onEdit} variant={isEditMode ? 'success' : 'warning'} className="px-3 py-2 md:px-5 md:py-3">
                        <Edit size={20} /> <span className="hidden sm:inline">{isEditMode ? 'Finish Editing' : 'Edit'}</span>
                    </Button>

                    <div className="relative" ref={moreMenuRef}>
                        <Button
                            type="button"
                            variant="secondary"
                            className="px-3 py-2 md:px-5 md:py-3"
                            aria-expanded={moreOpen}
                            aria-haspopup="menu"
                            aria-label={moreOpen ? 'Close settings menu' : 'Open settings menu'}
                            onClick={() => setMoreOpen((o) => !o)}
                        >
                            <Settings size={20} />
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
            </div>

            <div className="mt-4 md:w-1/3">
                <input
                    ref={ref}
                    type="search"
                    placeholder="Search anything..."
                    value={searchQuery}
                    onChange={onSearchChange}
                    onKeyDown={onKeyDown}
                    className="w-full p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="off"
                />
            </div>
        </header>
    );
});

Header.displayName = 'Header';
