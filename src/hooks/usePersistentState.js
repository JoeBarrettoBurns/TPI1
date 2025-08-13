// src/hooks/usePersistentState.js

import { useState, useEffect } from 'react';

export function usePersistentState(key, defaultValue) {
    const [state, setState] = useState(() => {
        try {
            const storedValue = localStorage.getItem(key);
            if (storedValue) {
                return JSON.parse(storedValue);
            }
        } catch (error) {
            console.error("Error reading from localStorage", error);
        }
        return defaultValue;
    });

    useEffect(() => {
        // Do not persist the default value if it's empty for arrays/objects; otherwise persist.
        const shouldPersist = Array.isArray(state)
            ? state.length > 0
            : (state && typeof state === 'object')
                ? Object.keys(state).length > 0
                : state !== undefined && state !== null;
        if (!shouldPersist) return;
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error("Error writing to localStorage", error);
        }
    }, [key, state]);

    return [state, setState];
}