import React from 'react';
import { ArrowLeft, X } from 'lucide-react';

export const BaseModal = ({ children, onClose, onBack, title, maxWidthClass = 'max-w-4xl', zClass = 'z-50' }: any) => (
    <div className={`fixed inset-0 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center ${zClass} p-4`} onClick={onClose}>
        <div className={`bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl w-full ${maxWidthClass} transform transition-all`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="shrink-0 text-zinc-400 hover:text-white"
                            aria-label="Back"
                        >
                            <ArrowLeft size={24} />
                        </button>
                    )}
                    <h3 className="text-2xl font-bold text-white truncate">{title}</h3>
                </div>
                <button onClick={onClose} className="shrink-0 text-zinc-400 hover:text-white"><X size={28} /></button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
                {children}
            </div>
        </div>
    </div>
);