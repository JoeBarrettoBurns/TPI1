// src/hooks/usePersistentState.ts

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export function usePersistentState<T = any>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
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