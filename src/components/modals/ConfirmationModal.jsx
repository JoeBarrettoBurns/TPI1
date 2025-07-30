import React from 'react';
import { Button } from '../common/Button';

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <p className="mt-2 text-zinc-300">{message}</p>
                </div>
                <div className="flex justify-end gap-4 p-4 bg-zinc-900/50 rounded-b-2xl">
                    <Button onClick={onClose} variant="secondary">Cancel</Button>
                    <Button onClick={onConfirm} variant="danger">Confirm</Button>
                </div>
            </div>
        </div>
    );
};