import React, { useState, useMemo, useEffect } from 'react';
import { writeBatch, runTransaction, doc, collection, deleteDoc } from 'firebase/firestore';
import { db, appId } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    getGaugeFromMaterial,
    calculateCostBySupplier,
    calculateAnalyticsByCategory
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
import { CostAnalyticsView } from './views/CostAnalyticsView';

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

    // Memoize all data calculations
    const inventorySummary = useMemo(() => calculateInventorySummary(inventory), [inventory]);
    const incomingSummary = useMemo(() => calculateIncomingSummary(inventory), [inventory]);
    const costBySupplier = useMemo(() => calculateCostBySupplier(inventory), [inventory]);
    const analyticsByCategory = useMemo(() => calculateAnalyticsByCategory(inventory), [inventory]);

    const closeModal = () => setModal({ type: null, data: null });

    // --- Core Data Writing Functions ---

    const handleAddOrEditOrder = async (jobs, originalOrderGroup = null) => {
        const isEditing = !!originalOrderGroup;
        await runTransaction(db, async (transaction) => {
            if (isEditing) {
                originalOrderGroup.details.forEach(item => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                    transaction.delete(docRef);
                });
            }

            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
            jobs.forEach(job => {
                const jobName = job.jobName.trim() || null;
                job.items.forEach(item => {
                    const arrivalDateString = job.arrivalDate;
                    const localDate = arrivalDateString ? new Date(`${arrivalDateString}T00:00:00`) : null;

                    const stockData = {
                        materialType: item.materialType,
                        gauge: getGaugeFromMaterial(item.materialType),
                        supplier: job.supplier,
                        costPerPound: parseFloat(item.costPerPound || 0),
                        // FIX: Check for both possible date property names to prevent 'undefined' error
                        createdAt: isEditing ? (originalOrderGroup.date || originalOrderGroup.dateOrdered) : new Date().toISOString(),
                        job: jobName,
                        status: job.status,
                        arrivalDate: job.status === 'Ordered' && localDate ? localDate.toISOString() : null,
                        dateReceived: null,
                    };

                    STANDARD_LENGTHS.forEach(len => {
                        const qty = parseInt(item[`qty${len}`] || 0);
                        for (let i = 0; i < qty; i++) {
                            const newDocRef = doc(inventoryCollectionRef);
                            transaction.set(newDocRef, { ...stockData, width: 48, length: len });
                        }
                    });
                });
            });
        });
    };

    const handleDeleteInventoryGroup = async (group) => {
        if (!group?.details?.length) return;
        const batch = writeBatch(db);
        group.details.forEach(item => {
            const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
            batch.delete(docRef);
        });
        await batch.commit();
    };

    const handleDeleteLog = async (logId) => {
        const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, logId);
        await deleteDoc(logDocRef);
    };

    const handleReceiveOrder = async (orderGroup) => {
        const batch = writeBatch(db);
        orderGroup.details.forEach(item => {
            if (item.id) {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                batch.update(docRef, { status: 'On Hand', dateReceived: new Date().toISOString().split('T')[0] });
            }
        });
        await batch.commit();
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
                    <p>User ID: <span className="font-mono bg-slate-800 px-2 py-1 rounded">{userId || 'Authenticating...'}</span></p>
                </footer>
            </div>

            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={handleAddOrEditOrder} />}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} inventory={inventory} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} inventory={inventory} />}
        </div>
    );
}
