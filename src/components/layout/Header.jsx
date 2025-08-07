// src/components/layout/Header.jsx

import React, { forwardRef } from 'react';
import { Plus, Minus, Edit, Box, Users, LogOut } from 'lucide-react';
import { Button } from '../common/Button';

export const Header = forwardRef(({
    searchQuery,
    onSearchChange,
    onKeyDown,
    onAdd,
    onUse,
    onEdit,
    isEditMode,
    onManageCategories,
    onManageSuppliers,
    activeView,
    onSignOut
}, ref) => {

    return (
        <header className="mb-8">
            {/* Top Row: Title and Action Buttons */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <img src="/tecnopan-logo.png" alt="TecnoPan Logo" className="h-12 md:h-16 w-auto" />
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center sm:text-left">TecnoPan Inventory</h1>
                </div>
                <div className="flex flex-wrap justify-center md:justify-end gap-2">
                    <Button onClick={onAdd} className="px-3 py-2 md:px-5 md:py-3"><Plus size={20} /> <span className="hidden sm:inline">Add Stock</span></Button>
                    <Button onClick={onUse} variant="secondary" className="px-3 py-2 md:px-5 md:py-3"><Minus size={20} /> <span className="hidden sm:inline">Use Stock</span></Button>
                    <Button onClick={onManageCategories} variant="secondary" className="px-3 py-2 md:px-5 md:py-3"><Box size={20} /> <span className="hidden sm:inline">Manage Categories</span></Button>
                    <Button onClick={onManageSuppliers} variant="secondary" className="px-3 py-2 md:px-5 md:py-3"><Users size={20} /> <span className="hidden sm:inline">Manage Suppliers</span></Button>
                    {activeView === 'dashboard' && (
                        <Button onClick={onEdit} variant={isEditMode ? 'success' : 'warning'} className="px-3 py-2 md:px-5 md:py-3">
                            <Edit size={20} /> <span className="hidden sm:inline">{isEditMode ? 'Finish Editing' : 'Edit Stock'}</span>
                        </Button>
                    )}
                    <Button onClick={onSignOut} variant="danger" className="ml-0 md:ml-4 px-3 py-2 md:px-5 md:py-3"><LogOut size={20} /> <span className="hidden sm:inline">Sign Out</span></Button>
                </div>
            </div>

            {/* Bottom Row: Search Bar */}
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