// src/hooks/useApiData.js
import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'http://localhost:3000/api';

export function useApiData() {
    const [inventory, setInventory] = useState([]);
    const [usageLog, setUsageLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId] = useState('local-user'); // Placeholder for custom auth

    const fetchData = useCallback(async () => {
        // Don't reset loading to true on refetch, to avoid screen flicker
        setError('');
        try {
            const [inventoryRes, usageLogRes] = await Promise.all([
                fetch(`${API_BASE_URL}/inventory`),
                fetch(`${API_BASE_URL}/logs`)
            ]);

            if (!inventoryRes.ok || !usageLogRes.ok) {
                throw new Error('Failed to fetch data from the server.');
            }

            const inventoryData = await inventoryRes.json();
            const usageLogData = await usageLogRes.json();

            setInventory(inventoryData);
            setUsageLog(usageLogData);
        } catch (err) {
            console.error("Data fetch error:", err);
            setError(err.message || 'Could not connect to the server.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { inventory, usageLog, loading, error, userId, refetchData: fetchData };
}
