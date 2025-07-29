import React, { useState } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { X } from 'lucide-react';

export const ManageSuppliersModal = ({ onClose, suppliers, onAddSupplier, onDeleteSupplier }) => {
    const [newSupplier, setNewSupplier] = useState('');

    const handleAdd = () => {
        if (newSupplier.trim() && !suppliers.includes(newSupplier.trim())) {
            onAddSupplier(newSupplier.trim());
            setNewSupplier('');
        }
    };

    return (
        <BaseModal onClose={onClose} title="Manage Suppliers">
            <div className="space-y-4">
                <div>
                    <h4 className="text-lg font-semibold text-white">Add Supplier</h4>
                    <div className="flex gap-2 mt-2">
                        <FormInput
                            name="newSupplier"
                            value={newSupplier}
                            onChange={(e) => setNewSupplier(e.target.value)}
                            placeholder="New supplier name"
                        />
                        <Button onClick={handleAdd}>Add</Button>
                    </div>
                </div>
                <div>
                    <h4 className="text-lg font-semibold text-white">Existing Suppliers</h4>
                    <ul className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                        {suppliers.map(supplier => (
                            <li key={supplier} className="flex justify-between items-center bg-slate-700 p-2 rounded">
                                <span>{supplier}</span>
                                <button onClick={() => onDeleteSupplier(supplier)} className="text-red-400 hover:text-red-300">
                                    <X size={18} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </BaseModal>
    );
};