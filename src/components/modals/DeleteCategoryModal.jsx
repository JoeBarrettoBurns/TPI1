import React from 'react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';

export const DeleteCategoryModal = ({ onClose, onConfirm, categoryName, error, isSubmitting = false }) => (
    <BaseModal onClose={isSubmitting ? () => {} : onClose} title={`Delete Category: ${categoryName}`} zClass="z-[60]">
        <div className="space-y-4">
            <p>Are you sure you want to delete the "{categoryName}" category?</p>
            <p className="text-sm text-slate-400">All materials within this category will also be deleted. This action cannot be undone.</p>
            {error && <ErrorMessage message={error} />}
            <div className="flex justify-end gap-4">
                <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                <Button variant="danger" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? 'Deleting…' : 'Delete'}</Button>
            </div>
        </div>
    </BaseModal>
);