import React, { useState, useMemo} from 'react';

// Import the new custom hook for data fetching
import { useApiData } from './hooks/useApiData';

// Utility and Constant Imports
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    calculateCostBySupplier,
    calculateAnalyticsByCategory
} from './utils/dataProcessing';
import { MATERIALS, CATEGORIES } from './constants/materials';

// Layout & Common Components
import { Header } from './components/layout/Header';
import { ViewTabs } from './components/layout/ViewTabs';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';

// Views
import { DashboardView } from './views/DashboardView';
import { LogsView } from './views/LogsView';
import { MaterialDetailView } from './views/MaterialDetailView';
import { CostAnalyticsView } from './views/CostAnalyticsView';

// Modals
import { AddOrderModal } from './components/modals/AddOrderModal';
import { UseStockModal } from './components/modals/UseStockModal';
import { EditOutgoingLogModal } from './components/modals/EditOutgoingLogModal';

// Define the base URL for your custom API server
const API_BASE_URL = 'http://localhost:3000/api';

export default function App() {
    // State management using the new custom hook
    const { inventory, usageLog, loading, error, userId, refetchData } = useApiData();
    const [activeView, setActiveView] = useState('dashboard');
    const [modal, setModal] = useState({ type: null, data: null });
    const [isEditMode, setIsEditMode] = useState(false);
    const [scrollToMaterial, setScrollToMaterial] = useState(null);

    // Memoized calculations remain the same, as they operate on local state
    const inventorySummary = useMemo(() => calculateInventorySummary(inventory), [inventory]);
    const incomingSummary = useMemo(() => calculateIncomingSummary(inventory), [inventory]);
    const costBySupplier = useMemo(() => calculateCostBySupplier(inventory), [inventory]);
    const analyticsByCategory = useMemo(() => calculateAnalyticsByCategory(inventory), [inventory]);

    const closeModal = () => setModal({ type: null, data: null });

    // --- API Data Writing Functions ---

    const handleAddOrEditOrder = async (jobs, originalOrderGroup = null) => {
        const isEditing = !!originalOrderGroup;
        // Note: The backend logic for editing will need to handle this properly.
        // For simplicity, we use the same endpoint for add and edit.
        const url = `${API_BASE_URL}/inventory/group`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobs, originalOrderGroup }),
            });

            if (!response.ok) {
                const res = await response.json();
                throw new Error(res.message || 'Failed to save the order.');
            }
            await refetchData(); // Refetch data to show changes
        } catch (err) {
            console.error("Error saving order:", err);
            // You can also set an error state here to show in the modal
        }
    };

    const handleDeleteInventoryGroup = async (group) => {
        if (!group?.details?.length) return;
        try {
            const response = await fetch(`${API_BASE_URL}/inventory/group`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds: group.details.map(d => d.id) }),
            });
            if (!response.ok) throw new Error('Failed to delete the inventory group.');
            await refetchData();
        } catch (err) {
            console.error("Error deleting inventory group:", err);
        }
    };

    const handleDeleteLog = async (logId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/logs/${logId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete the log entry.');
            await refetchData();
        } catch (err) {
            console.error("Error deleting log:", err);
        }
    };

    const handleReceiveOrder = async (orderGroup) => {
        try {
            const response = await fetch(`${API_BASE_URL}/inventory/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds: orderGroup.details.map(d => d.id) }),
            });
            if (!response.ok) throw new Error('Failed to receive the order.');
            await refetchData();
        } catch (err) {
            console.error("Error receiving order:", err);
        }
    };

    const handleEditOutgoingLog = async (logEntry, updatedData) => {
        // The logic to edit a log can be complex (e.g., reverting stock changes).
        // This is a placeholder for the API call. The backend will handle the complexity.
        try {
            const response = await fetch(`${API_BASE_URL}/logs/${logEntry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData),
            });
            if (!response.ok) throw new Error('Failed to update log entry.');
            await refetchData();
        } catch (err) {
            console.error("Error updating log:", err);
        }
    };

    const openModalForEdit = (transaction) => {
        const modalType = transaction.isAddition ? 'edit-order' : 'edit-log';
        setModal({ type: modalType, data: transaction });
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'dashboard':
                return <DashboardView
                    inventorySummary={inventorySummary} incomingSummary={incomingSummary} isEditMode={isEditMode}
                    onMaterialClick={(materialType) => {
                        const category = MATERIALS[materialType]?.category;
                        if (category) {
                            setActiveView(category);
                            setScrollToMaterial(materialType);
                        }
                    }}
                />;
            case 'logs':
                return <LogsView
                    inventory={inventory} usageLog={usageLog} onEditOrder={openModalForEdit}
                    onDeleteInventoryGroup={handleDeleteInventoryGroup} onDeleteLog={handleDeleteLog}
                />;
            case 'analytics':
                return <CostAnalyticsView
                    costBySupplier={costBySupplier}
                    analyticsByCategory={analyticsByCategory}
                />;
            default:
                if (CATEGORIES.includes(activeView)) {
                    return <MaterialDetailView
                        category={activeView} inventory={inventory} usageLog={usageLog}
                        inventorySummary={inventorySummary} incomingSummary={incomingSummary}
                        onDeleteLog={handleDeleteLog} onDeleteInventoryGroup={handleDeleteInventoryGroup}
                        onEditOrder={openModalForEdit} onReceiveOrder={handleReceiveOrder}
                        scrollToMaterial={scrollToMaterial} onScrollToComplete={() => setScrollToMaterial(null)}
                    />;
                }
                return null;
        }
    };

    return (
        <div className="bg-slate-900 min-h-screen font-sans text-slate-200">
            <div className="container mx-auto p-4 md:p-8">
                <Header onAdd={() => setModal({ type: 'add' })} onUse={() => setModal({ type: 'use' })} onEdit={() => setIsEditMode(!isEditMode)} isEditMode={isEditMode} />
                <ViewTabs activeView={activeView} setActiveView={setActiveView} />
                {error && <ErrorMessage message={error} />}

                {loading ? <LoadingSpinner /> : renderActiveView()}

                <footer className="text-center text-slate-500 mt-8 text-sm">
                    <p>TecnoPan Inventory System</p>
                    <p>User ID: <span className="font-mono bg-slate-800 px-2 py-1 rounded">{userId}</span></p>
                </footer>
            </div>

            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={handleAddOrEditOrder} />}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} inventory={inventory} onStockUsed={refetchData} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} onSave={handleEditOutgoingLog} logEntry={modal.data} />}
        </div>
    );
}
