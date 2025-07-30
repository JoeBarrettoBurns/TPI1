import React from 'react';
import { X } from 'lucide-react';

export const BaseModal = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-4xl transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-zinc-700">
                <h3 className="text-2xl font-bold text-white">{title}</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={28} /></button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
                {children}
            </div>
        </div>
    </div>
);