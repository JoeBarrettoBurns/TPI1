import React from 'react';

const VARIANTS = {
    primary: 'bg-blue-600 hover:bg-blue-500',
    secondary: 'bg-slate-700 hover:bg-slate-600',
    warning: 'bg-amber-600 hover:bg-amber-500',
    success: 'bg-green-600 hover:bg-green-500',
    danger: 'bg-red-600 hover:bg-red-500',
    ghost: 'bg-transparent hover:bg-slate-700'
};

export const Button = ({ children, onClick, variant = 'primary', type = 'button', disabled = false, className = '' }) => {
    const baseClasses = 'flex items-center justify-center gap-2 text-white font-semibold px-5 py-3 rounded-lg shadow-md transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed';
    return (
        <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${VARIANTS[variant]} ${className}`}>
            {children}
        </button>
    );
};