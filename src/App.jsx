import React, { useState, useMemo, useEffect } from 'react';
import { writeBatch, runTransaction, doc, collection, deleteDoc } from 'firebase/firestore';
import { db, appId } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    getGaugeFromMaterial,
    calculateCostBySupplier,      // <-- Import new function
    calculateQuantityByMaterial   // <-- Import new function
} from './utils/dataProcessing';
import { MATERIALS, CATEGORIES, STANDARD_LENGTHS } from './constants/materials';

// Layout & Common Components
import { Header } from './components/layout/Header';
import { ViewTabs } from './components/layout/ViewTabs';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';

// Views
import { DashboardView } from './views/DashboardView';
import { LogsView } from './views/LogsView';
import { MaterialDetailView } from './views/MaterialDetailView';
import { CostAnalyticsView } from './views/CostAnalyticsView'; // <-- Import new view

// Modals
import { AddOrderModal } from './components/modals/AddOrderModal';
import { UseStockModal } from './components/modals/UseStockModal';
import { EditOutgoingLogModal } from './components/modals/EditOutgoingLogModal';

export default function App() {
    const { inventory, usageLog, loading, error, userId } = useFirestoreData();
    const [activeView, setActiveView] = useState('dashboard');
    const [modal, setModal] = useState({ type: null, data: null });
    const [isEditMode, setIsEditMode] = useState(false);
    const [scrollToMaterial, setScrollToMaterial] = useState(null);

    // Add Recharts script dynamically to the head
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://unpkg.com/recharts/umd/Recharts.min.js";
        script.async = true;
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        }
    }, []);

    // Memoize all data calculations
    const inventorySummary = useMemo(() => calculateInventorySummary(inventory), [inventory]);
    const incomingSummary = useMemo(() => calculateIncomingSummary(inventory), [inventory]);
    const costBySupplier = useMemo(() => calculateCostBySupplier(inventory), [inventory]);
    const quantityByMaterial = useMemo(() => calculateQuantityByMaterial(inventory), [inventory]);

    const closeModal = () => setModal({ type: null, data: null });

    // --- Core Data Writing Functions (unchanged) ---
    const handleAddOrEditOrder = async (jobs, originalOrderGroup = null) => {
        // ... function logic
    };
    const handleDeleteInventoryGroup = async (group) => {
        // ... function logic
    };
    const handleDeleteLog = async (logId) => {
        // ... function logic
    };
    const handleReceiveOrder = async (orderGroup) => {
        // ... function logic
    };

    const openModalForEdit = (transaction) => {
        const modalType = transaction.isAddition ? 'edit-order' : 'edit-log';
        setModal({ type: modalType, data: transaction });
    };

    // --- Updated View Renderer ---
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
                    quantityByMaterial={quantityByMaterial}
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
                    <p>User ID: <span className="font-mono bg-slate-800 px-2 py-1 rounded">{userId || 'Authenticating...'}</span></p>
                </footer>
            </div>

            {/* Modals (unchanged) */}
            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={handleAddOrEditOrder} />}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} inventory={inventory} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} inventory={inventory} />}
        </div>
    );
}
