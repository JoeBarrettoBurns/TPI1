import React, { useRef, useCallback } from 'react';

export const FormInput = ({ label, name, type = "text", value, onChange, required = false, as = "input", children, ...props }) => {
    const inputRef = useRef(null);

    const handleContainerMouseDown = useCallback((e) => {
        if (as !== 'input' || type !== 'date') return;
        // Only act on genuine user gestures and when clicking outside the input
        if (!e.isTrusted || (e.target && e.target.tagName === 'INPUT')) return;
        const element = inputRef.current;
        if (!element) return;
        try {
            if (navigator && navigator.userActivation && !navigator.userActivation.isActive) {
                element.focus();
                return;
            }
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
        <div onMouseDown={handleContainerMouseDown}>
            <label htmlFor={name} className="block text-sm font-medium text-zinc-300">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {as === 'input' ? <input ref={inputRef} type={type} {...commonProps} /> : <select {...commonProps}>{children}</select>}
        </div>
    );
};