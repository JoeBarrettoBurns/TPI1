// src/components/modals/AddMaterialModal.jsx

import React, { useState } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';

export const AddMaterialModal = ({ onClose, onSave, categories }) => {
    const [material, setMaterial] = useState({
        name: '',
        category: categories[0] || '',
        thickness: '',
        density: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setMaterial(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!material.name || !material.category || !material.thickness || !material.density) {
            setError('All fields are required.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            // Pass the material name (as ID) and the rest of the data
            await onSave(material.name, {
                category: material.category,
                thickness: parseFloat(material.thickness),
                density: parseFloat(material.density)
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to add material.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <BaseModal onClose={onClose} title="Add New Material">
            <form onSubmit={handleSubmit} className="space-y-4">
                <FormInput label="Material Name (e.g., 22GA-GALV)" name="name" value={material.name} onChange={handleChange} required />
                <FormInput label="Category" name="category" value={material.category} onChange={handleChange} as="select" required>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </FormInput>
                <FormInput label="Thickness (in inches)" name="thickness" type="number" value={material.thickness} onChange={handleChange} required step="0.001" />
                <FormInput label="Density (lbs/in³)" name="density" type="number" value={material.density} onChange={handleChange} required step="0.0001" />
                {error && <ErrorMessage message={error} />}
                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Material'}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
};