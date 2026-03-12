import React, { useRef, useCallback } from 'react';

export const FormInput = ({ label, name, type = "text", value, onChange, required = false, as = "input", children, ...props }) => {
    const inputRef = useRef(null);

    const handleDateFieldMouseDown = useCallback((e) => {
        if (as !== 'input' || type !== 'date') return;
        // Only act on genuine primary-button user clicks.
        if (!e.isTrusted || e.button !== 0) return;
        const element = inputRef.current;
        if (!element || element.disabled || element.readOnly) return;
        try {
            if (navigator && navigator.userActivation && !navigator.userActivation.isActive) {
                element.focus();
                return;
            }
            element.focus();
            if (typeof element.showPicker === 'function') {
                element.showPicker();
            } else {
                element.focus();
            }
        } catch (err) {
            element.focus();
        }
    }, [as, type]);

    const commonProps = {
        name,
        id: name,
        value,
        onChange,
        required,
        className: "w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
        ...props
    };

    return (
        <div onMouseDown={handleDateFieldMouseDown}>
            <label htmlFor={name} className="block text-sm font-medium text-zinc-300">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {as === 'input' ? <input ref={inputRef} type={type} {...commonProps} /> : <select {...commonProps}>{children}</select>}
        </div>
    );
};