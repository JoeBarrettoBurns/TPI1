// src/App.jsx

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { writeBatch, runTransaction, doc, collection, deleteDoc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import Fuse from 'fuse.js';
import { db, appId } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import { usePersistentState } from './hooks/usePersistentState';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    getGaugeFromMaterial,
    calculateCostBySupplier,
    calculateAnalyticsByCategory,
    groupLogsByJob
} from './utils/dataProcessing';
import { INITIAL_SUPPLIERS, STANDARD_LENGTHS } from './constants/materials';

// Layout & Common Components
import { Header } from './components/layout/Header';
import { ViewTabs } from './components/layout/ViewTabs';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';
import { SearchResultsDropdown } from './components/common/SearchResultsDropdown';

// Views
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { LogsView } from './views/LogsView';
import { MaterialDetailView } from './views/MaterialDetailView';
import { CostAnalyticsView } from './views/CostAnalyticsView';
import { PriceHistoryView } from './views/PriceHistoryView';
import { ReorderView } from './views/ReorderView';
import { JobOverviewView } from './views/JobOverviewView';


// Modals
import { AddOrderModal } from './components/modals/AddOrderModal';
import { UseStockModal } from './components/modals/UseStockModal';
import { EditOutgoingLogModal } from './components/modals/EditOutgoingLogModal';
import { ManageCategoriesModal } from './components/modals/ManageCategoriesModal';
import { BackupModal } from './components/modals/BackupModal';
import { ManageSuppliersModal } from './components/modals/ManageSuppliersModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { backupCollections, getLatestBackupInfo } from './utils/backupService';

// AI Assistant
import { AIAssistant } from './components/assistant/AIAssistant';
import { Bot } from 'lucide-react';


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
    const [selectedJobFromSearch, setSelectedJobFromSearch] = useState(null);
    const searchInputRef = useRef(null);
    const [searchResults, setSearchResults] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [fuse, setFuse] = useState(null);
    const searchTimeoutRef = useRef(null);
    const [isAssistantVisible, setIsAssistantVisible] = useState(false);

    const closeModal = useCallback(() => setModal({ type: null, data: null, error: null }), []);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults([]);
        setActiveIndex(0);
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                if (isAssistantVisible) {
                    setIsAssistantVisible(false);
                } else if (modal.type) {
                    closeModal();
                } else if (searchQuery) {
                    clearSearch();
                } else if (activeView !== 'dashboard') {
                    setActiveView('dashboard');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeModal, clearSearch, modal.type, searchQuery, isAssistantVisible, activeView]);

    // Daily backup on first app open per day
    useEffect(() => {
        const doDailyBackup = async () => {
            try {
                const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                const lastBackupKey = localStorage.getItem('lastBackupDate');
                if (lastBackupKey === todayKey) return;
                // Make a lightweight check of latest backup; if not today, run backup
                const latest = await getLatestBackupInfo(db, appId);
                const isToday = latest?.createdAt?.slice(0, 10) === todayKey;
                if (!isToday) {
                    await backupCollections(db, appId, ['materials', 'inventory', 'usage_logs']);
                }
                localStorage.setItem('lastBackupDate', todayKey);
            } catch (e) {
                console.warn('Daily backup skipped:', e?.message || e);
            }
        };
        doDailyBackup();
    }, []);

    useEffect(() => {
        const handleGlobalKeyPress = (event) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
            if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyPress);
        return () => window.removeEventListener('keydown', handleGlobalKeyPress);
    }, []);

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

    // Derive material types from Firestore doc IDs (now canonical)
    const materialTypes = useMemo(() => Object.keys(materials), [materials]);
    const allJobs = useMemo(() => groupLogsByJob(inventory, usageLog), [inventory, usageLog]);
    const inventorySummary = useMemo(() => calculateInventorySummary(inventory, materialTypes), [inventory, materialTypes]);
    const incomingSummary = useMemo(() => calculateIncomingSummary(inventory, materialTypes), [inventory, materialTypes]);
    const costBySupplier = useMemo(() => calculateCostBySupplier(inventory, materials), [inventory, materials]);
    const analyticsByCategory = useMemo(() => calculateAnalyticsByCategory(inventory, materials), [inventory, materials]);

    const handleSignOut = useCallback(() => {
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(false);
    }, []);

    const handleFinishEditing = useCallback(() => {
        if (categoriesToDelete.length > 0) {
            setModal({ type: 'confirm-delete-categories', data: categoriesToDelete });
        } else {
            setIsEditMode(false);
        }
    }, [categoriesToDelete]);

    useEffect(() => {
        if (loading) return;

        const commands = [
            { type: 'command', name: 'Add Stock', aliases: ['add', 'new', 'order'], action: () => setModal({ type: 'add' }) },
            { type: 'command', name: 'Use Stock', aliases: ['use'], action: () => setModal({ type: 'use' }) },
            { type: 'command', name: 'Manage Categories', aliases: ['mc', 'manage cat'], action: () => setModal({ type: 'manage-categories' }) },
            { type: 'command', name: 'Manage Suppliers', aliases: ['ms', 'manage sup'], action: () => setModal({ type: 'manage-suppliers' }) },
            { type: 'command', name: 'Edit/Finish', aliases: ['edit', 'finish'], action: () => isEditMode ? handleFinishEditing() : setIsEditMode(true), view: 'dashboard' },
            { type: 'command', name: 'Sign Out', aliases: ['sign out', 'logout', 'log off'], action: () => handleSignOut() },
        ];

        const views = [
            { type: 'view', name: 'Dashboard', id: 'dashboard' },
            { type: 'view', name: 'Jobs', id: 'jobs' },
            { type: 'view', name: 'Logs', id: 'logs' },
            { type: 'view', name: 'Price History', id: 'price-history' },
            { type: 'view', name: 'Analytics', id: 'analytics' },
            { type: 'view', name: 'Reorder', id: 'reorder' },
        ];

        const searchDocs = [
            ...commands.flatMap(c => [{ type: c.type, name: c.name, action: c.action, view: c.view }, ...c.aliases.map(a => ({ type: c.type, name: `${c.name} (alias: ${a})`, alias: a, action: c.action, view: c.view }))]),
            ...views.map(v => ({ type: 'view', name: v.name, id: v.id })),
            ...initialCategories.map(c => ({ type: 'category', name: c })),
            ...materialTypes.map(m => ({ type: 'material', name: m, category: materials[m]?.category })),
            ...allJobs.map(j => ({ type: 'job', name: j.job, customer: j.customer, data: j })),
        ];

        const fuseOptions = {
            includeScore: true,
            keys: ['name', 'alias', 'customer'],
            threshold: 0.4,
        };

        setFuse(new Fuse(searchDocs, fuseOptions));

    }, [loading, materials, inventory, usageLog, initialCategories, isEditMode, allJobs, materialTypes, handleFinishEditing, handleSignOut]);


    const handleSearchChange = (e) => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        const query = e.target.value;
        setSearchQuery(query);
        setActiveIndex(0);

        if (query.trim() === '') {
            setSearchResults([]);
            return;
        }

        if (fuse) {
            const results = fuse.search(query).slice(0, 10);
            setSearchResults(results);
        }

        searchTimeoutRef.current = setTimeout(() => {
            setSearchResults([]);
        }, 2000); // Disappear after 2 seconds
    };

    const handleResultSelect = (result) => {
        const item = result.item;
        switch (item.type) {
            case 'command':
                if (item.view && activeView !== item.view) break;
                item.action();
                break;
            case 'view':
                setActiveView(item.id);
                break;
            case 'category':
                setActiveView(item.name);
                break;
            case 'material':
                setActiveView(item.category);
                setScrollToMaterial(item.name);
                break;
            case 'job':
                setActiveView('jobs');
                setSelectedJobFromSearch(item.data);
                break;
            default:
                break;
        }
        clearSearch();
        searchInputRef.current?.blur();
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults[activeIndex]) {
                handleResultSelect(searchResults[activeIndex]);
            }
            return;
        }

        if (searchResults.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % searchResults.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
                break;
            default:
                break;
        }
    };


    const onScrollToComplete = useCallback(() => setScrollToMaterial(null), []);

    const handleRestock = (materialType) => {
        setModal({ type: 'add', data: { preselectedMaterial: materialType } });
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

    const handleManageCategory = async (categoryName, materialsFromModal, mode) => {
            const materialsCollectionRef = collection(db, `artifacts/${appId}/public/data/materials`);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

        try {
            await runTransaction(db, async (transaction) => {
                const allMaterialsSnapshot = await getDocs(materialsCollectionRef);
                const allMaterials = {};
                allMaterialsSnapshot.forEach(docSnap => {
                    // Use canonical Firestore IDs as names to avoid mismatches
                    allMaterials[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
                });

                if (mode === 'add') {
                    for (const material of materialsFromModal) {
                        if (!material.name || !material.thickness || !material.density) continue;
                        if (allMaterials[material.name]) {
                            throw new Error(`A material named "${material.name}" already exists.`);
                        }
                        const materialId = material.name.replace(/\//g, '-');
                        const newMaterialRef = doc(materialsCollectionRef, materialId);
                        transaction.set(newMaterialRef, {
                            category: categoryName,
                            thickness: parseFloat(material.thickness),
                            density: parseFloat(material.density),
                        });
                    }
                    return;
                }

                // Edit existing category materials
                const originalById = Object.fromEntries(
                    Object.entries(allMaterials)
                        .filter(([id, m]) => m.category === categoryName)
                        .map(([id, m]) => [id, { ...m, name: id }])
                );

                // Determine deletions (materials removed entirely)
                const keepOriginalIds = new Set(
                    materialsFromModal.filter(m => !m.isNew && m.id).map(m => m.id)
                );
                for (const [origId, mat] of Object.entries(originalById)) {
                    if (!keepOriginalIds.has(origId)) {
                        transaction.delete(doc(materialsCollectionRef, origId));
                    }
                }

                for (const modalMaterial of materialsFromModal) {
                    const hasAllFields = modalMaterial.name && modalMaterial.thickness && modalMaterial.density;
                    if (!hasAllFields) continue;

                    const newThickness = parseFloat(modalMaterial.thickness);
                    const newDensity = parseFloat(modalMaterial.density);

                    if (modalMaterial.isNew) {
                        const newName = modalMaterial.name.trim();
                        if (allMaterials[newName]) {
                            throw new Error(`A material named "${newName}" already exists.`);
                        }
                        const newId = newName.replace(/\//g, '-');
                        const newRef = doc(materialsCollectionRef, newId);
                        transaction.set(newRef, { category: categoryName, thickness: newThickness, density: newDensity });
                        continue;
                    }

                    const resolvedOriginalName = modalMaterial.id ?? modalMaterial.originalName ?? (originalById[modalMaterial.id]?.name);
                    if (!resolvedOriginalName) {
                        // If we cannot resolve the original name, skip safely
                        continue;
                    }
                    const existing = allMaterials[resolvedOriginalName];
                    if (!existing) continue;
                    const originalDocId = existing.id;

                    const newName = modalMaterial.name.trim();
                    if (newName !== resolvedOriginalName) {
                        if (allMaterials[newName]) {
                            throw new Error(`A material named "${newName}" already exists. Please choose a different name.`);
                        }
                        const newId = newName.replace(/\//g, '-');
                        const newRef = doc(materialsCollectionRef, newId);
                        transaction.set(newRef, { category: categoryName, thickness: newThickness, density: newDensity });

                        // Update inventory documents referencing the old name in any historical format
                        const oldVariants = Array.from(new Set([
                            resolvedOriginalName,
                            resolvedOriginalName.replace(/-/g, '/'),
                            resolvedOriginalName.replace(/\//g, '-')
                        ]));
                        for (const oldName of oldVariants) {
                            const invQuery = query(inventoryCollectionRef, where("materialType", "==", oldName));
                            const invSnapshot = await getDocs(invQuery);
                            invSnapshot.forEach(itemDoc => {
                                transaction.update(doc(inventoryCollectionRef, itemDoc.id), { materialType: newId });
                            });
                        }

                        transaction.delete(doc(materialsCollectionRef, originalDocId));
                    } else if (existing.thickness !== newThickness || existing.density !== newDensity) {
                        transaction.update(doc(materialsCollectionRef, originalDocId), {
                            thickness: newThickness,
                            density: newDensity,
                        });
                    }
                }
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            throw error;
        }
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
                        createdAt: (job.createdAt ? new Date(job.createdAt + 'T00:00:00').toISOString() : (isEditing ? (originalOrderGroup.date || originalOrderGroup.dateOrdered) : new Date().toISOString())),
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
                    // Allow editing the usedAt date for completed logs if provided
                    ...(newLogData.date ? { usedAt: new Date(newLogData.date + 'T00:00:00').toISOString() } : {})
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
            case 'jobs':
                return <JobOverviewView
                    allJobs={allJobs}
                    inventory={inventory}
                    usageLog={usageLog}
                    materials={materials}
                    suppliers={suppliers}
                    handleAddOrEditOrder={handleAddOrEditOrder}
                    handleUseStock={handleUseStock}
                    initialSelectedJob={selectedJobFromSearch}
                    onClearSelectedJob={() => setSelectedJobFromSearch(null)}
                    searchQuery={searchQuery}
                />;
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
                    inventory={inventory}
                    suppliers={suppliers}
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
                    onManageCategories={() => setModal({ type: 'manage-categories' })}
                    onManageSuppliers={() => setModal({ type: 'manage-suppliers' })}
                    activeView={activeView}
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onOpenBackup={() => setModal({ type: 'backup' })}
                    onLogoClick={() => setActiveView('dashboard')}
                />

                <div className="relative">
                    {searchResults.length > 0 && (
                        <SearchResultsDropdown
                            results={searchResults}
                            onSelect={handleResultSelect}
                            activeIndex={activeIndex}
                            setActiveIndex={setActiveIndex}
                        />
                    )}
                </div>


                <ViewTabs activeView={activeView} setActiveView={setActiveView} categories={categories} />
                {error && <ErrorMessage message={error} />}

                {loading ? <LoadingSpinner /> : renderActiveView()}

                <footer className="text-center text-zinc-500 mt-8 text-sm">
                    <p>TecnoPan Inventory System</p>
                    <p>User: <span className="font-mono bg-zinc-800 px-2 py-1 rounded">{userId}</span></p>
                </footer>
            </div>

            {/* AI Assistant Button and Window */}
            <button
                onClick={() => setIsAssistantVisible(true)}
                className="fixed bottom-6 right-6 bg-blue-800 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-transform transform hover:scale-110 z-40"
                aria-label="Open AI Assistant"
            >
                <Bot size={28} />
            </button>

            <AIAssistant
                isVisible={isAssistantVisible}
                onClose={() => setIsAssistantVisible(false)}
                inventory={inventory}
                materials={materials}
                suppliers={suppliers}
                usageLog={usageLog}
                onExecuteOrder={(jobs) => handleAddOrEditOrder(jobs)}
                onOpenModal={(type) => setModal({ type })}
            />



            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={handleAddOrEditOrder} materialTypes={materialTypes} suppliers={suppliers} preselectedMaterial={modal.data?.preselectedMaterial} />}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" materialTypes={materialTypes} suppliers={suppliers} />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} onSave={handleUseStock} inventory={inventory} materialTypes={materialTypes} inventorySummary={inventorySummary} incomingSummary={incomingSummary} suppliers={suppliers} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} onSave={handleEditOutgoingLog} inventory={inventory} materialTypes={materialTypes} />}
            {modal.type === 'manage-categories' && <ManageCategoriesModal onClose={closeModal} onSave={handleManageCategory} categories={initialCategories} materials={materials} />}
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
            {modal.type === 'backup' && <BackupModal onClose={closeModal} />}
        </div>
    );
}