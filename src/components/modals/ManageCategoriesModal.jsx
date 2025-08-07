// src/components/modals/ManageCategoriesModal.jsx

import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { X, Edit, Trash2, PlusCircle } from 'lucide-react';

export const ManageCategoriesModal = ({ onClose, onSave, categories, materials }) => {
    const [mode, setMode] = useState('edit'); // 'edit' or 'add'
    const [selectedCategory, setSelectedCategory] = useState(categories[0] || '');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryMaterials, setCategoryMaterials] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (mode === 'edit' && selectedCategory) {
            const materialsInCategory = Object.entries(materials)
                .filter(([, material]) => material.category === selectedCategory)
                .map(([name, material]) => ({ ...material, name, originalName: name, isNew: false }));
            setCategoryMaterials(materialsInCategory);
        } else {
            setCategoryMaterials([{ name: '', thickness: '', density: '', isNew: true }]);
        }
    }, [selectedCategory, materials, mode]);

    const handleMaterialChange = (index, field, value) => {
        const newMaterials = [...categoryMaterials];
        newMaterials[index][field] = value;
        setCategoryMaterials(newMaterials);
    };

    const addMaterialRow = () => {
        setCategoryMaterials([...categoryMaterials, { name: '', thickness: '', density: '', isNew: true }]);
    };

    const removeMaterialRow = (index) => {
        const newMaterials = categoryMaterials.filter((_, i) => i !== index);
        setCategoryMaterials(newMaterials);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const finalCategoryName = mode === 'add' ? newCategoryName.trim() : selectedCategory;
        if (!finalCategoryName) {
            setError('Category name is required.');
            return;
        }
        if (categoryMaterials.some(m => !m.name.trim() || !m.thickness || !m.density)) {
            setError('All fields for all materials are required.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            await onSave(finalCategoryName, categoryMaterials, mode);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to save changes.');
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <BaseModal onClose={onClose} title="Manage Categories and Materials">
            <div className="flex justify-end mb-4">
                <Button onClick={() => setMode(m => m === 'edit' ? 'add' : 'edit')} variant="secondary">
                    {mode === 'edit' ? 'Add New Category' : 'Edit Existing Category'}
                </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
                {mode === 'edit' ? (
                    <div>
                        <label htmlFor="category-select" className="block text-sm font-medium text-zinc-300">Category</label>
                        <select
                            id="category-select"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg"
                        >
                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                ) : (
                    <FormInput
                        label="New Category Name"
                        name="newCategoryName"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        required
                        placeholder="e.g., Cold Rolled Steel"
                    />
                )}


                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
                    <h4 className="text-lg font-semibold text-white">Materials in {mode === 'edit' ? selectedCategory : newCategoryName || 'New Category'}</h4>
                    {categoryMaterials.map((material, index) => (
                        <div key={index} className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative">
                            {categoryMaterials.length > 1 && (
                                <button type="button" onClick={() => removeMaterialRow(index)} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                                    <X size={18} />
                                </button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormInput label="Material Name" value={material.name} onChange={(e) => handleMaterialChange(index, 'name', e.target.value)} required placeholder="e.g., 16GA-CRS" />
                                <FormInput label="Thickness (in)" type="number" value={material.thickness} onChange={(e) => handleMaterialChange(index, 'thickness', e.target.value)} required step="0.001" />
                                <FormInput label="Density (lbs/inł)" type="number" value={material.density} onChange={(e) => handleMaterialChange(index, 'density', e.target.value)} required step="0.0001" />
                            </div>
                        </div>
                    ))}
                    <Button variant="ghost" className="w-full mt-2 !border-dashed !border-slate-600 hover:!border-blue-500" onClick={addMaterialRow}>
                        <PlusCircle size={16} /> Add Material
                    </Button>
                </div>

                {error && <ErrorMessage message={error} />}

                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};