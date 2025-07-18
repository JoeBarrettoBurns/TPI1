import React from 'react';

export const FormInput = ({ label, name, type = "text", value, onChange, required = false, as = "input", children, ...props }) => {
    const commonProps = {
        name,
        id: name,
        value,
        onChange,
        required,
        className: "w-full mt-1 p-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
        ...props
    };

    return (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-slate-300">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {as === 'input' ? <input type={type} {...commonProps} /> : <select {...commonProps}>{children}</select>}
        </div>
    );
};