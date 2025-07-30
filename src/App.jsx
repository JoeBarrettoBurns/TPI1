import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, closestCenter} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { writeBatch, runTransaction, doc, collection, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, appId } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import { usePersistentState } from './hooks/usePersistentState';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    getGaugeFromMaterial,
    calculateCostBySupplier,
    calculateAnalyticsByCategory
} from './utils/dataProcessing';
import { INITIAL_SUPPLIERS, STANDARD_LENGTHS } from './constants/materials';

// Layout & Common Components
import { Header } from './components/layout/Header';
import { ViewTabs } from './components/layout/ViewTabs';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';

// Views
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { LogsView } from './views/LogsView';
import { MaterialDetailView } from './views/MaterialDetailView';
import { CostAnalyticsView } from './views/CostAnalyticsView';
import { PriceHistoryView } from './views/PriceHistoryView';
import { ReorderView } from './views/ReorderView';

// Modals
import { AddOrderModal } from './components/modals/AddOrderModal';
import { UseStockModal } from './components/modals/UseStockModal';
import { EditOutgoingLogModal } from './components/modals/EditOutgoingLogModal';
import { AddCategoryModal } from './components/modals/AddCategoryModal';
import { ManageSuppliersModal } from './components/modals/ManageSuppliersModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';


export default function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
    const { inventory, usageLog, materials, loading, error, userId } = useFirestoreData();

    const [activeView, setActiveView] = useState('dashboard');
    const [modal, setModal] = useState({ type: null, data: null, error: null });
    const [isEditMode, setIsEditMode] = useState(false);
    const [scrollToMaterial, setScrollToMaterial] = useState(null);
    const [activeCategory, setActiveCategory] = useState(null);
    const [suppliers, setSuppliers] = usePersistentState('suppliers', INITIAL_SUPPLIERS);
    const [categoriesToDelete, setCategoriesToDelete] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef(null);

    // Effect to handle global keypress to focus search
    useEffect(() => {
        const handleGlobalKeyPress = (event) => {
            // Don't interfere if the user is already typing in an input/textarea/select
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
                return;
            }

            // Focus search on letter/number key press, but not on modifiers like Shift, Ctrl, etc.
            if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyPress);

        return () => {
            window.removeEventListener('keydown', handleGlobalKeyPress);
        };
    }, []); // Empty dependency array ensures this effect runs only once

    const initialCategories = useMemo(() => [...new Set(Object.values(materials).map(m => m.category))], [materials]);
    const [categories, setCategories] = usePersistentState('dashboard-category-order', initialCategories);

    useEffect(() => {
        if (!loading) {
            setCategories(prevOrder => {
                const liveCategories = new Set(initialCategories);
                const validOrdered = prevOrder.filter(cat => liveCategories.has(cat));
                const newCategories = initialCategories.filter(cat => !prevOrder.includes(cat));
                return [...validOrdered, ...newCategories];
            });
        }
    }, [initialCategories, setCategories, loading]);

    const materialTypes = useMemo(() => Object.keys(materials), [materials]);
    const inventorySummary = useMemo(() => calculateInventorySummary(inventory, materialTypes), [inventory, materialTypes]);
    const incomingSummary = useMemo(() => calculateIncomingSummary(inventory, materialTypes), [inventory, materialTypes]);
    const costBySupplier = useMemo(() => calculateCostBySupplier(inventory, materials), [inventory, materials]);
    const analyticsByCategory = useMemo(() => calculateAnalyticsByCategory(inventory, materials), [inventory, materials]);
    const closeModal = () => setModal({ type: null, data: null, error: null });

    const onScrollToComplete = useCallback(() => setScrollToMaterial(null), []);

    const handleSignOut = () => {
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(false);
    };

    const handleRestock = (materialType) => {
        setModal({ type: 'add', data: { preselectedMaterial: materialType } });
    };

    const handleSearchSubmit = () => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return;

        // Priority 1: Check for a material match
        const matchedMaterial = materialTypes.find(m => m.toLowerCase().includes(query));
        if (matchedMaterial) {
            const category = materials[matchedMaterial]?.category;
            if (category) {
                setActiveView(category);
                setScrollToMaterial(matchedMaterial);
                setSearchQuery('');
                return;
            }
        }

        // Priority 2: Check for a category match (case-insensitive)
        const matchedCategory = categories.find(c => c.toLowerCase().startsWith(query));
        if (matchedCategory) {
            setActiveView(matchedCategory); // Use the original cased name
            setSearchQuery('');
            return;
        }

        // Priority 3: Check for a main view match
        const mainViews = ['dashboard', 'logs', 'price history', 'analytics', 'reorder'];
        const matchedMainView = mainViews.find(v => v.startsWith(query));
        if (matchedMainView) {
            setActiveView(matchedMainView.replace(' ', '-'));
            setSearchQuery('');
        }
    };

    const handleDragStart = (event) => setActiveCategory(event.active.id);
    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setCategories((items) => arrayMove(items, items.indexOf(active.id), items.indexOf(over.id)));
        }
        setActiveCategory(null);
    };
    const handleDragCancel = () => setActiveCategory(null);

    const handleToggleCategoryForDeletion = (categoryName) => {
        setCategoriesToDelete(prev =>
            prev.includes(categoryName)
                ? prev.filter(c => c !== categoryName)
                : [...prev, categoryName]
        );
    };

    const handleFinishEditing = () => {
        if (categoriesToDelete.length > 0) {
            setModal({ type: 'confirm-delete-categories', data: categoriesToDelete });
        } else {
            setIsEditMode(false);
        }
    };

    const handleConfirmDeleteCategories = async () => {
        try {
            const materialsToDelete = Object.values(materials).filter(m => categoriesToDelete.includes(m.category));
            const materialIdsToDelete = materialsToDelete.map(m => m.id);
            const inventoryToDelete = inventory.filter(item => materialIdsToDelete.includes(item.materialType));

            const allDocRefsToDelete = [
                ...materialIdsToDelete.map(id => doc(db, `artifacts/${appId}/public/data/materials`, id.replace(/\//g, '-'))),
                ...inventoryToDelete.map(item => doc(db, `artifacts/${appId}/public/data/inventory`, item.id))
            ];

            const MAX_BATCH_SIZE = 500;
            for (let i = 0; i < allDocRefsToDelete.length; i += MAX_BATCH_SIZE) {
                const chunk = allDocRefsToDelete.slice(i, i + MAX_BATCH_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(docRef => batch.delete(docRef));
                await batch.commit();
            }

            setCategoriesToDelete([]);
            setIsEditMode(false);
            closeModal();
            setActiveView('dashboard');
        } catch (err) {
            console.error("Error deleting categories:", err);
            setModal(prev => ({ ...prev, error: "Failed to delete categories. Please try again." }));
        }
    };

    const handleUseStock = async (jobs, options) => {
        const { isScheduled, scheduledDate } = options;

        await runTransaction(db, async (transaction) => {
            const usageLogCollectionRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

            for (const job of jobs) {
                if (isScheduled) {
                    const itemsForLog = [];
                    let totalItems = 0;

                    for (const item of job.items) {
                        for (const len of STANDARD_LENGTHS) {
                            const qty = parseInt(item[`qty${len}`] || 0);
                            if (qty > 0) {
                                totalItems += qty;
                                const materialInfo = materials[item.materialType];
                                for (let i = 0; i < qty; i++) {
                                    itemsForLog.push({
                                        materialType: item.materialType,
                                        length: len,
                                        width: 48,
                                        gauge: getGaugeFromMaterial(item.materialType),
                                        density: materialInfo?.density || 0,
                                        thickness: materialInfo?.thickness || 0,
                                    });
                                }
                            }
                        }
                    }

                    if (itemsForLog.length > 0) {
                        const logDocRef = doc(usageLogCollectionRef);
                        const logEntry = {
                            job: job.jobName.trim() || 'N/A',
                            customer: job.customer,
                            createdAt: new Date().toISOString(),
                            usedAt: new Date(scheduledDate + 'T00:00:00').toISOString(),
                            status: 'Scheduled',
                            details: itemsForLog,
                            qty: -totalItems,
                        };
                        transaction.set(logDocRef, logEntry);
                    }
                } else {
                    const usedItemsForLog = [];
                    const logDocRef = doc(usageLogCollectionRef);

                    for (const item of job.items) {
                        for (const len of STANDARD_LENGTHS) {
                            const qty = parseInt(item[`qty${len}`] || 0);
                            if (qty <= 0) continue;

                            const matchingSheets = inventory.filter(i =>
                                i.materialType === item.materialType && i.length === len && i.status === 'On Hand'
                            ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                            if (matchingSheets.length < qty) {
                                throw new Error(`Not enough stock for ${qty}x ${item.materialType} @ ${len}". Only ${matchingSheets.length} available.`);
                            }

                            const sheetsToUse = matchingSheets.slice(0, qty);
                            sheetsToUse.forEach(sheet => {
                                const stockDocRef = doc(inventoryCollectionRef, sheet.id);
                                transaction.update(stockDocRef, {
                                    status: 'Used',
                                    usageLogId: logDocRef.id,
                                    jobNameUsed: job.jobName.trim() || 'N/A',
                                    customerUsed: job.customer,
                                    usedAt: new Date().toISOString()
                                });
                                usedItemsForLog.push(sheet);
                            });
                        }
                    }

                    if (usedItemsForLog.length > 0) {
                        const logEntry = {
                            job: job.jobName.trim() || 'N/A',
                            customer: job.customer,
                            usedAt: new Date().toISOString(),
                            createdAt: new Date().toISOString(),
                            status: 'Completed',
                            details: usedItemsForLog,
                            qty: -usedItemsForLog.length,
                        };
                        transaction.set(logDocRef, logEntry);
                    }
                }
            }
        });
    };

    const handleFulfillScheduledLog = async (logToFulfill) => {
        try {
            await runTransaction(db, async (transaction) => {
                const itemsNeeded = logToFulfill.details.reduce((acc, item) => {
                    const key = `${item.materialType}|${item.length}`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});

                const inventoryToUpdate = [];
                for (const [key, qty] of Object.entries(itemsNeeded)) {
                    const [materialType, lengthStr] = key.split('|');
                    const length = parseInt(lengthStr, 10);

                    const availableSheets = inventory.filter(i =>
                        i.materialType === materialType && i.length === length && i.status === 'On Hand'
                    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                    if (availableSheets.length < qty) {
                        throw new Error(`Cannot fulfill: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`);
                    }
                    inventoryToUpdate.push(...availableSheets.slice(0, qty));
                }

                inventoryToUpdate.forEach(sheet => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, sheet.id);
                    transaction.update(docRef, {
                        status: 'Used',
                        usageLogId: logToFulfill.id,
                        jobNameUsed: logToFulfill.job,
                        customerUsed: logToFulfill.customer,
                        usedAt: new Date().toISOString()
                    });
                });

                const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, logToFulfill.id);
                transaction.update(logDocRef, {
                    status: 'Completed',
                    details: inventoryToUpdate,
                    fulfilledAt: new Date().toISOString()
                });
            });
        } catch (error) {
            console.error("Fulfillment Error:", error);
            alert(`Failed to fulfill order: ${error.message}`);
        }
    };

    const handleAddCategory = async (categoryName, materialsToAdd) => {
        const batch = writeBatch(db);

        materialsToAdd.forEach(material => {
            const materialId = material.name.replace(/\//g, '-');
            const newMaterialRef = doc(db, `artifacts/${appId}/public/data/materials`, materialId);

            batch.set(newMaterialRef, {
                category: categoryName,
                thickness: parseFloat(material.thickness),
                density: parseFloat(material.density)
            });
        });

        await batch.commit();
    };

    const handleAddSupplier = (supplier) => {
        setSuppliers(prev => [...prev, supplier]);
    };

    const handleDeleteSupplier = (supplier) => {
        setSuppliers(prev => prev.filter(s => s !== supplier));
    };

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
                const jobName = job.jobName.trim() || 'N/A';
                job.items.forEach(item => {
                    const arrivalDateString = job.arrivalDate;
                    const localDate = arrivalDateString ? new Date(`${arrivalDateString}T00:00:00`) : null;

                    const stockData = {
                        materialType: item.materialType,
                        gauge: getGaugeFromMaterial(item.materialType),
                        supplier: job.supplier,
                        costPerPound: parseFloat(item.costPerPound || 0),
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

    const handleStockEdit = async (materialType, length, newQuantity) => {
        const currentQuantity = inventorySummary[materialType]?.[length] || 0;
        const diff = newQuantity - currentQuantity;

        if (diff === 0) return;

        await runTransaction(db, async (transaction) => {
            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

            if (diff > 0) {
                const materialInfo = materials[materialType];
                const stockData = {
                    materialType: materialType,
                    gauge: getGaugeFromMaterial(materialType),
                    supplier: 'Manual Edit',
                    costPerPound: 0,
                    createdAt: new Date().toISOString(),
                    job: `MODIFICATION: ADD`,
                    status: 'On Hand',
                    dateReceived: new Date().toISOString().split('T')[0],
                    width: 48,
                    length: length,
                    density: materialInfo?.density || 0,
                    thickness: materialInfo?.thickness || 0,
                };
                for (let i = 0; i < diff; i++) {
                    const newDocRef = doc(inventoryCollectionRef);
                    transaction.set(newDocRef, stockData);
                }
            } else {
                const sheetsToRemove = Math.abs(diff);
                const availableSheets = inventory.filter(
                    item => item.materialType === materialType &&
                        item.length === length &&
                        item.status === 'On Hand'
                ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                if (availableSheets.length < sheetsToRemove) {
                    throw new Error(`Cannot remove ${sheetsToRemove} sheets. Only ${availableSheets.length} available.`);
                }

                const sheetsToDelete = availableSheets.slice(0, sheetsToRemove);
                sheetsToDelete.forEach(sheet => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, sheet.id);
                    transaction.delete(docRef);
                });
            }
        });
    };

    const handleEditOutgoingLog = async (originalLog, newLogData) => {
        const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, originalLog.id);

        if (originalLog.status === 'Scheduled') {
            const newDetails = [];
            let totalItems = 0;
            for (const item of newLogData.items) {
                for (const len of STANDARD_LENGTHS) {
                    const qty = parseInt(item[`qty${len}`] || 0);
                    if (qty > 0) {
                        totalItems += qty;
                        const materialInfo = materials[item.materialType];
                        for (let i = 0; i < qty; i++) {
                            newDetails.push({
                                materialType: item.materialType, length: len, width: 48,
                                gauge: getGaugeFromMaterial(item.materialType),
                                density: materialInfo?.density || 0,
                                thickness: materialInfo?.thickness || 0,
                            });
                        }
                    }
                }
            }
            await updateDoc(logDocRef, {
                job: newLogData.jobName.trim() || 'N/A',
                customer: newLogData.customer,
                usedAt: new Date(newLogData.date + 'T00:00:00').toISOString(),
                details: newDetails,
                qty: -totalItems
            });
        } else {
            // Logic for editing a COMPLETED log
            await runTransaction(db, async (transaction) => {
                const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

                const netChange = {};
                (originalLog.details || []).forEach(item => {
                    const key = `${item.materialType}|${item.length}`;
                    netChange[key] = (netChange[key] || 0) + 1;
                });
                newLogData.items.forEach(item => {
                    STANDARD_LENGTHS.forEach(len => {
                        const qty = parseInt(item[`qty${len}`] || 0);
                        if (qty > 0) {
                            const key = `${item.materialType}|${len}`;
                            netChange[key] = (netChange[key] || 0) - qty;
                        }
                    });
                });

                for (const key in netChange) {
                    if (netChange[key] < 0) {
                        const [materialType, lengthStr] = key.split('|');
                        const length = parseInt(lengthStr, 10);
                        const needed = Math.abs(netChange[key]);

                        const currentStock = inventory.filter(i =>
                            i.materialType === materialType &&
                            i.length === length &&
                            i.status === 'On Hand'
                        ).length;

                        if (currentStock < needed) {
                            throw new Error(`Not enough stock for ${materialType} @ ${length}". Needed: ${needed}, Available: ${currentStock}.`);
                        }
                    }
                }

                const originalItemIds = (originalLog.details || []).map(d => d.id);
                const itemsToReturn = inventory.filter(i => originalItemIds.includes(i.id));
                itemsToReturn.forEach(item => {
                    const docRef = doc(inventoryCollectionRef, item.id);
                    transaction.update(docRef, {
                        status: 'On Hand',
                        usageLogId: null,
                        jobNameUsed: null,
                        customerUsed: null,
                        usedAt: null
                    });
                });

                const updatedUsedItemsForLog = [];
                for (const item of newLogData.items) {
                    for (const len of STANDARD_LENGTHS) {
                        const qty = parseInt(item[`qty${len}`] || 0);
                        if (qty <= 0) continue;

                        const matchingSheets = inventory.filter(
                            (i) => i.materialType === item.materialType && i.length === len && i.status === 'On Hand' && !originalItemIds.includes(i.id)
                        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                        const sheetsToUse = matchingSheets.slice(0, qty);

                        if (sheetsToUse.length < qty) {
                            throw new Error(`Concurrency Error: Not enough stock for ${item.materialType} @ ${len}" during edit.`);
                        }

                        sheetsToUse.forEach((sheet) => {
                            const stockDocRef = doc(inventoryCollectionRef, sheet.id);
                            transaction.update(stockDocRef, {
                                status: 'Used',
                                usageLogId: originalLog.id,
                                jobNameUsed: newLogData.jobName,
                                customerUsed: newLogData.customer,
                                usedAt: new Date().toISOString()
                            });
                            updatedUsedItemsForLog.push(sheet);
                        });
                    }
                }

                transaction.update(logDocRef, {
                    job: newLogData.jobName,
                    customer: newLogData.customer,
                    details: updatedUsedItemsForLog,
                    qty: -updatedUsedItemsForLog.length,
                });
            });
        }
    };

    const openModalForEdit = (transaction) => {
        const modalType = transaction.isAddition ? 'edit-order' : 'edit-log';
        setModal({ type: modalType, data: transaction });
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'dashboard':
                return (
                    <DndContext
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                    >
                        <DashboardView
                            inventorySummary={inventorySummary}
                            incomingSummary={incomingSummary}
                            isEditMode={isEditMode}
                            materials={materials}
                            categories={categories}
                            onSave={handleStockEdit}
                            onMaterialClick={(materialType) => {
                                const category = materials[materialType]?.category;
                                if (category) {
                                    setActiveView(category);
                                    setScrollToMaterial(materialType);
                                }
                            }}
                            activeCategory={activeCategory}
                            onDeleteCategory={handleToggleCategoryForDeletion}
                            categoriesToDelete={categoriesToDelete}
                            searchQuery={searchQuery}
                        />
                    </DndContext>
                );
            case 'logs':
                return <LogsView
                    inventory={inventory} usageLog={usageLog} onEditOrder={openModalForEdit}
                    onDeleteInventoryGroup={handleDeleteInventoryGroup} onDeleteLog={handleDeleteLog}
                    materials={materials}
                    onFulfillLog={handleFulfillScheduledLog}
                    onReceiveOrder={handleReceiveOrder}
                    searchQuery={searchQuery}
                />;
            case 'price-history':
                return <PriceHistoryView
                    inventory={inventory}
                    materials={materials}
                    searchQuery={searchQuery}
                />;
            case 'analytics':
                return <CostAnalyticsView
                    costBySupplier={costBySupplier}
                    analyticsByCategory={analyticsByCategory}
                />;
            case 'reorder':
                return <ReorderView
                    inventorySummary={inventorySummary}
                    materials={materials}
                    onRestock={handleRestock}
                    searchQuery={searchQuery}
                />;
            default:
                if (initialCategories.includes(activeView)) {
                    return <MaterialDetailView
                        category={activeView} inventory={inventory} usageLog={usageLog}
                        inventorySummary={inventorySummary} incomingSummary={incomingSummary}
                        materials={materials}
                        materialTypes={materialTypes}
                        onDeleteLog={handleDeleteLog} onDeleteInventoryGroup={handleDeleteInventoryGroup}
                        onEditOrder={openModalForEdit} onReceiveOrder={handleReceiveOrder}
                        onFulfillLog={handleFulfillScheduledLog}
                        scrollToMaterial={scrollToMaterial}
                        onScrollToComplete={onScrollToComplete}
                        searchQuery={searchQuery}
                    />;
                }
                return null;
        }
    };

    if (!isLoggedIn) {
        return <AuthView onLoginSuccess={() => setIsLoggedIn(true)} />;
    }

    return (
        <div className="bg-zinc-900 min-h-screen font-sans text-zinc-200">
            <div className="container mx-auto p-4 md:p-8">
                <Header
                    ref={searchInputRef}
                    onAdd={() => setModal({ type: 'add' })}
                    onUse={() => setModal({ type: 'use' })}
                    onEdit={() => isEditMode ? handleFinishEditing() : setIsEditMode(true)}
                    onSignOut={handleSignOut}
                    isEditMode={isEditMode}
                    onAddCategory={() => setModal({ type: 'add-category' })}
                    onManageSuppliers={() => setModal({ type: 'manage-suppliers' })}
                    activeView={activeView}
                    searchQuery={searchQuery}
                    onSearchChange={(e) => setSearchQuery(e.target.value)}
                    onSearchSubmit={handleSearchSubmit}
                />
                <ViewTabs activeView={activeView} setActiveView={setActiveView} categories={categories} />
                {error && <ErrorMessage message={error} />}

                {loading ? <LoadingSpinner /> : renderActiveView()}

                <footer className="text-center text-zinc-500 mt-8 text-sm">
                    <p>TecnoPan Inventory System</p>
                    <p>User: <span className="font-mono bg-zinc-800 px-2 py-1 rounded">{userId}</span></p>
                </footer>
            </div>

            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={handleAddOrEditOrder} materialTypes={materialTypes} suppliers={suppliers} preselectedMaterial={modal.data?.preselectedMaterial} />}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" materialTypes={materialTypes} suppliers={suppliers} />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} onSave={handleUseStock} inventory={inventory} materialTypes={materialTypes} inventorySummary={inventorySummary} incomingSummary={incomingSummary} suppliers={suppliers} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} onSave={handleEditOutgoingLog} inventory={inventory} materialTypes={materialTypes} />}
            {modal.type === 'add-category' && <AddCategoryModal onClose={closeModal} onSave={handleAddCategory} />}
            {modal.type === 'manage-suppliers' && <ManageSuppliersModal onClose={closeModal} suppliers={suppliers} onAddSupplier={handleAddSupplier} onDeleteSupplier={handleDeleteSupplier} />}
            {modal.type === 'confirm-delete-categories' &&
                <ConfirmationModal
                    isOpen={true}
                    onClose={closeModal}
                    onConfirm={handleConfirmDeleteCategories}
                    title="Confirm Deletion"
                    message={`Are you sure you want to delete ${modal.data.length} categor${modal.data.length > 1 ? 'ies' : 'y'} and all associated materials/inventory? This action cannot be undone.`}
                />
            }
        </div>
    );
}