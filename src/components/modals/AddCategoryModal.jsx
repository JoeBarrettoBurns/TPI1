// src/components/modals/AddCategoryModal.jsx

import React, { useState } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { X } from 'lucide-react';

export const AddCategoryModal = ({ onClose, onSave }) => {
    const [categoryName, setCategoryName] = useState('');
    const [materials, setMaterials] = useState([
        { name: '', thickness: '', density: '' }
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleMaterialChange = (index, field, value) => {
        const newMaterials = [...materials];
        newMaterials[index][field] = value;
        setMaterials(newMaterials);
    };

    const addMaterialRow = () => {
        setMaterials([...materials, { name: '', thickness: '', density: '' }]);
    };

    const removeMaterialRow = (index) => {
        const newMaterials = materials.filter((_, i) => i !== index);
        setMaterials(newMaterials);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!categoryName.trim()) {
            setError('Category name is required.');
            return;
        }
        if (materials.some(m => !m.name.trim() || !m.thickness || !m.density)) {
            setError('All fields for all materials are required.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            await onSave(categoryName, materials);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to save new category.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <BaseModal onClose={onClose} title="Add New Material Category">
            <form onSubmit={handleSubmit} className="space-y-6">
                <FormInput
                    label="New Category Name"
                    name="categoryName"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    required
                    placeholder="e.g., Cold Rolled Steel"
                />

                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
                    <h4 className="text-lg font-semibold text-white">Materials in this Category</h4>
                    {materials.map((material, index) => (
                        <div key={index} className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative">
                            {materials.length > 1 && (
                                <button type="button" onClick={() => removeMaterialRow(index)} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                                    <X size={18} />
                                </button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormInput label="Material Name" name={`name-${index}`} value={material.name} onChange={(e) => handleMaterialChange(index, 'name', e.target.value)} required placeholder="e.g., 16GA-CRS" />
                                <FormInput label="Thickness (in)" name={`thickness-${index}`} type="number" value={material.thickness} onChange={(e) => handleMaterialChange(index, 'thickness', e.target.value)} required step="0.001" />
                                <FormInput label="Density (lbs/in³)" name={`density-${index}`} type="number" value={material.density} onChange={(e) => handleMaterialChange(index, 'density', e.target.value)} required step="0.0001" />
                            </div>
                        </div>
                    ))}
                    <Button variant="ghost" className="w-full mt-2 !border-dashed !border-slate-600 hover:!border-blue-500" onClick={addMaterialRow}>
                        + Add Another Material
                    </Button>
                </div>

                {error && <ErrorMessage message={error} />}

                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Category'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};