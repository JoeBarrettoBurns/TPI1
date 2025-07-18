import React from 'react';
import { Dna, Plus, Minus, Edit } from 'lucide-react';
import { Button } from '../common/Button';

export const Header = ({ onAdd, onUse, onEdit, isEditMode }) => (
    <header className="flex flex-col md:flex-row justify-between items-center mb-8">
        <div className="flex items-center gap-4">
            <img src="/tecnopan-logo.png" alt="TecnoPan Logo" className="h-16 w-auto" />
            <h1 className="text-4xl font-bold text-white">TecnoPan Inventory</h1>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
            <Button onClick={onAdd}><Plus size={20} /> Add Stock</Button>
            <Button onClick={onUse} variant="secondary"><Minus size={20} /> Use Stock</Button>
            <Button onClick={onEdit} variant={isEditMode ? 'success' : 'warning'}>
                <Edit size={20} /> {isEditMode ? 'Finish Editing' : 'Edit Stock'}
            </Button>
        </div>
    </header>
);