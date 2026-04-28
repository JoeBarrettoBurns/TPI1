// src/App.jsx

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { writeBatch, doc, collection, updateDoc, getDocs, query, where, getDoc, setDoc, onSnapshot, orderBy, limit } from './firebase/firestoreWithTracking';
import Fuse from 'fuse.js';
import { db, appId, auth, signOut } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import { useSuppliersSync } from './hooks/useSuppliersSync';
import { usePersistentState } from './hooks/usePersistentState';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    calculateScheduledOutgoingSummary,
    getGaugeFromMaterial,
    groupLogsByJob
} from './utils/dataProcessing';
import { STANDARD_LENGTHS } from './constants/materials';
import { buildBuyOrderEmailBody, createSupplierMailtoLink } from './utils/buyOrderUtils';
import { buildMaterialIndicatorSettingsMap, normalizeCategoryIndicatorSettings } from './utils/categoryIndicatorSettings';
import { AI_ASSISTANT_ENABLED } from './constants/featureFlags';

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
import { PriceHistoryView } from './views/PriceHistoryView';
import { ReorderView } from './views/ReorderView';
import { JobOverviewView } from './views/JobOverviewView';
import { SheetCostCalculatorView } from './views/SheetCostCalculatorView';


// Modals
import { AddOrderModal } from './components/modals/AddOrderModal';
import { UseStockModal } from './components/modals/UseStockModal';
import { EditOutgoingLogModal } from './components/modals/EditOutgoingLogModal';
import { ManageCategoriesModal } from './components/modals/ManageCategoriesModal';
import { BackupModal } from './components/modals/BackupModal';
import { AuthenticationModal } from './components/modals/AuthenticationModal';
import { ManageSuppliersModal } from './components/modals/ManageSuppliersModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { BuyOrderDraftsModal } from './components/modals/BuyOrderDraftsModal';

import { AIAssistant } from './components/assistant/AIAssistant';
import { DebugPanel } from './components/debug/DebugPanel';
import { Bot } from 'lucide-react';

const BUY_ORDERS_PATH = `artifacts/${appId}/public/data/buy_orders`;
const LATEST_BUY_ORDER_LIMIT = 15;

function getTodayDateInputValue() {
    return new Date().toISOString().split('T')[0];
}

function normalizeOrderItemsForStorage(items = []) {
    return items.map((item) => ({
        materialType: item.materialType || '',
        qty96: String(item.qty96 || ''),
        qty120: String(item.qty120 || ''),
        qty144: String(item.qty144 || ''),
        customWidth: String(item.customWidth || ''),
        customLength: String(item.customLength || ''),
        customQty: String(item.customQty || ''),
        costPerPound: String(item.costPerPound || ''),
    }));
}

function getBuyOrderPrimarySupplier(buyOrder) {
    if (buyOrder?.supplier) {
        return buyOrder.supplier;
    }

    if (Array.isArray(buyOrder?.suppliers)) {
        return buyOrder.suppliers.find(Boolean) || '';
    }

    return '';
}

function openMailtoLinks(emailDrafts = []) {
    const validDrafts = emailDrafts.filter((draft) => draft?.mailto);
    if (validDrafts.length === 0) {
        return [];
    }

    const [firstDraft, ...remainingDrafts] = validDrafts;
    const blockedDrafts = [];
    remainingDrafts.forEach((draft) => {
        const popup = window.open(draft.mailto, '_blank', 'noopener,noreferrer');
        if (!popup) {
            blockedDrafts.push(draft);
        }
    });
    window.location.href = firstDraft.mailto;
    return blockedDrafts;
}


export default function App() {
    useEffect(() => {
        try {
            localStorage.removeItem('isLoggedIn');
        } catch {
            /* ignore */
        }
    }, []);

    const [activeView, setActiveView] = useState('dashboard');
    const [modal, setModal] = useState({ type: null, data: null, error: null });
    const [isEditMode, setIsEditMode] = useState(false);
    const [scrollToMaterial, setScrollToMaterial] = useState(null);
    const [activeCategory, setActiveCategory] = useState(null);
    const [categoriesToDelete, setCategoriesToDelete] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedJobFromSearch, setSelectedJobFromSearch] = useState(null);
    const searchInputRef = useRef(null);
    const [searchResults, setSearchResults] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [fuse, setFuse] = useState(null);
    const searchTimeoutRef = useRef(null);
    const [isAssistantVisible, setIsAssistantVisible] = useState(false);
    const [openBuyOrders, setOpenBuyOrders] = useState([]);
    const shouldLoadInventoryDetails = useMemo(() => {
        const lightweightViews = new Set(['dashboard', 'reorder', 'sheet-calculator']);
        const inventoryDependentModals = new Set(['use', 'edit-log', 'edit-order']);
        return !lightweightViews.has(activeView) || isEditMode || inventoryDependentModals.has(modal.type);
    }, [activeView, isEditMode, modal.type]);

    const {
        inventory,
        usageLog,
        materials,
        inventorySummaryData,
        incomingSummaryData,
        inventoryReady,
        loading,
        error,
        userId,
        authUser,
        authReady,
        authAccessDenied,
        authDeniedDetail,
        clearAuthAccessDenied,
        refetchMaterials
    } = useFirestoreData({ loadInventoryDetails: true });

    const { suppliers, setSuppliers, supplierInfo, setSupplierInfo } = useSuppliersSync(userId);

    const closeModal = useCallback(() => setModal({ type: null, data: null, error: null }), []);

    useEffect(() => {
        if (!userId) {
            setOpenBuyOrders([]);
            return undefined;
        }

        const buyOrdersQuery = query(
            collection(db, BUY_ORDERS_PATH),
            orderBy('openedEmailAt', 'desc'),
            limit(LATEST_BUY_ORDER_LIMIT)
        );

        return onSnapshot(
            buyOrdersQuery,
            (snapshot) => {
                const openBuyOrders = snapshot.docs
                    .map((buyOrderDoc) => ({ id: buyOrderDoc.id, ...buyOrderDoc.data() }))
                    .filter((buyOrder) => !buyOrder.workflowStatus || buyOrder.workflowStatus === 'emailed');

                setOpenBuyOrders(openBuyOrders);
            },
            (err) => {
                console.error('Failed to load buy orders:', err);
                setOpenBuyOrders([]);
            }
        );
    }, [userId]);

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
                if (AI_ASSISTANT_ENABLED && isAssistantVisible) {
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

    // Removed global "type to focus search" behavior; users must click the search bar to type

    const initialCategories = useMemo(() => [...new Set(Object.values(materials).map(m => m.category))], [materials]);
    const [categories, setCategories] = usePersistentState('dashboard-category-order', initialCategories);
    const materialIndicatorSettings = useMemo(
        () => buildMaterialIndicatorSettingsMap(materials),
        [materials]
    );

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
    const calculatedInventorySummary = useMemo(() => calculateInventorySummary(inventory, materialTypes), [inventory, materialTypes]);
    const calculatedIncomingSummary = useMemo(() => calculateIncomingSummary(inventory, materialTypes), [inventory, materialTypes]);
    const inventorySummary = useMemo(() => {
        if (inventory.length > 0) return calculatedInventorySummary;
        return Object.keys(inventorySummaryData || {}).length > 0 ? inventorySummaryData : calculatedInventorySummary;
    }, [inventory.length, calculatedInventorySummary, inventorySummaryData]);
    const incomingSummary = useMemo(() => {
        if (inventory.length > 0) return calculatedIncomingSummary;
        return Object.keys(incomingSummaryData || {}).length > 0 ? incomingSummaryData : calculatedIncomingSummary;
    }, [inventory.length, calculatedIncomingSummary, incomingSummaryData]);
    const scheduledOutgoingSummary = useMemo(() => calculateScheduledOutgoingSummary(usageLog, materialTypes), [usageLog, materialTypes]);
    const showLoading = loading || (shouldLoadInventoryDetails && !inventoryReady);

    const handleSignOut = useCallback(async () => {
        try {
            clearAuthAccessDenied();
            await signOut(auth);
        } catch (e) {
            console.error('Sign out failed:', e);
        }
    }, [clearAuthAccessDenied]);

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
            { type: 'command', name: 'Buy', aliases: ['purchase', 'email supplier'], action: () => setModal({ type: 'buy' }) },
            { type: 'command', name: 'Use Stock', aliases: ['use'], action: () => setModal({ type: 'use' }) },
            { type: 'command', name: 'Manage Categories', aliases: ['mc', 'manage cat'], action: () => setModal({ type: 'manage-categories' }) },
            { type: 'command', name: 'Manage Suppliers', aliases: ['ms', 'manage sup'], action: () => setModal({ type: 'manage-suppliers' }) },
            { type: 'command', name: 'Edit/Finish', aliases: ['edit', 'finish'], action: () => isEditMode ? handleFinishEditing() : setIsEditMode(true), view: 'dashboard' },
            { type: 'command', name: 'Sign Out', aliases: ['sign out', 'logout', 'log off'], action: () => handleSignOut() },
            { type: 'command', name: 'Authentication', aliases: ['auth', 'allowlist', 'whitelist'], action: () => setModal({ type: 'authentication' }) },
        ];

        const views = [
            { type: 'view', name: 'Dashboard', id: 'dashboard' },
            { type: 'view', name: 'Jobs', id: 'jobs' },
            { type: 'view', name: 'Logs', id: 'logs' },
            { type: 'view', name: 'Price History', id: 'price-history' },
            { type: 'view', name: 'Sheet Calculator', id: 'sheet-calculator' },
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

    const buildBuyOrderPrefillFromReorderItem = useCallback((item) => {
        if (!item) return null;

        const matchingPurchases = inventory
            .filter((inventoryItem) => inventoryItem.materialType === item.materialType)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const recentFromSupplier = item.supplier
            ? matchingPurchases.find((inventoryItem) => inventoryItem.supplier === item.supplier)
            : null;
        const latestPurchase = recentFromSupplier || matchingPurchases[0];
        const suggestedQty = String(Math.max(5 - (item.count || 0), 1));
        const supplier = suppliers.includes(item.supplier)
            ? item.supplier
            : (latestPurchase?.supplier && suppliers.includes(latestPurchase.supplier) ? latestPurchase.supplier : (suppliers[0] || ''));

        return {
            supplier,
            suppliers: supplier ? [supplier] : [],
            status: 'Ordered',
            createdAt: getTodayDateInputValue(),
            items: [{
                materialType: item.materialType,
                qty96: item.length === 96 ? suggestedQty : '',
                qty120: item.length === 120 ? suggestedQty : '',
                qty144: item.length === 144 ? suggestedQty : '',
                customWidth: '',
                customLength: '',
                customQty: '',
                costPerPound: latestPurchase?.costPerPound ? String(latestPurchase.costPerPound) : '',
            }]
        };
    }, [inventory, suppliers]);

    const handleOpenBuyModal = useCallback((prefill = null) => {
        setModal({ type: 'buy', data: prefill ? { prefill } : null });
    }, []);

    const handleRestock = useCallback((item) => {
        const prefill = typeof item === 'string'
            ? { createdAt: getTodayDateInputValue(), items: [{ materialType: item }], suppliers: suppliers[0] ? [suppliers[0]] : [] }
            : buildBuyOrderPrefillFromReorderItem(item);
        handleOpenBuyModal(prefill);
    }, [buildBuyOrderPrefillFromReorderItem, handleOpenBuyModal, suppliers]);

    const handleAddBuyOrderToInventory = useCallback((buyOrder) => {
        if (!buyOrder) return;
        setModal({
            type: 'add',
            data: {
                prefill: {
                    ...buyOrder,
                    supplier: getBuyOrderPrimarySupplier(buyOrder),
                },
                linkedBuyOrderId: buyOrder.id
            }
        });
    }, []);

    const handleClearAllBuyOrders = useCallback(async () => {
        if (openBuyOrders.length === 0) {
            return;
        }

        const confirmed = window.confirm(`Clear all ${openBuyOrders.length} open buy order${openBuyOrders.length === 1 ? '' : 's'}?`);
        if (!confirmed) {
            return;
        }

        const batch = writeBatch(db);
        const clearedAt = new Date().toISOString();

        openBuyOrders.forEach((buyOrder) => {
            batch.update(doc(db, BUY_ORDERS_PATH, buyOrder.id), {
                workflowStatus: 'cleared',
                clearedAt,
            });
        });

        await batch.commit();
    }, [openBuyOrders]);

    const handleDeleteBuyOrder = useCallback(async (buyOrder) => {
        if (!buyOrder?.id) {
            return;
        }

        const confirmed = window.confirm('Remove this buy order from the queue?');
        if (!confirmed) {
            return;
        }

        await updateDoc(doc(db, BUY_ORDERS_PATH, buyOrder.id), {
            workflowStatus: 'cleared',
            clearedAt: new Date().toISOString(),
        });
    }, []);

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
        const batch = writeBatch(db);
        const usageLogCollectionRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

        // If scheduling, we only write the log entries
        if (isScheduled) {
            for (const job of jobs) {
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
                    // Schedule at end-of-day to prevent immediate auto-fulfill for "today"
                    const scheduledUsedAtIso = new Date(scheduledDate + 'T23:59:59').toISOString();
                    const logEntry = {
                        job: job.jobName.trim() || 'N/A',
                        customer: job.customer,
                        createdAt: new Date().toISOString(),
                        usedAt: scheduledUsedAtIso,
                        status: 'Scheduled',
                        details: itemsForLog,
                        qty: -totalItems,
                    };
                    batch.set(logDocRef, logEntry);
                }
            }
            await batch.commit();
            return;
        }

        // Use Now: skip individual transaction reads for speed
        for (const job of jobs) {
            const logDocRef = doc(usageLogCollectionRef);
            const usedItems = [];

            for (const item of job.items) {
                for (const len of STANDARD_LENGTHS) {
                    const qty = parseInt(item[`qty${len}`] || 0);
                    if (qty <= 0) continue;

                    const matchingSheets = inventory
                        .filter(i => i.materialType === item.materialType && i.length === len && i.status === 'On Hand')
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                    if (matchingSheets.length < qty) {
                        throw new Error(`Not enough stock for ${qty}x ${item.materialType} @ ${len}". Only ${matchingSheets.length} available.`);
                    }

                    const sheetsToUse = matchingSheets.slice(0, qty);
                    for (const sheet of sheetsToUse) {
                        const ref = doc(inventoryCollectionRef, sheet.id);
                        usedItems.push({ id: sheet.id, ...sheet });
                        batch.update(ref, {
                            status: 'Used',
                            usageLogId: logDocRef.id,
                            jobNameUsed: job.jobName.trim() || 'N/A',
                            customerUsed: job.customer,
                            usedAt: new Date().toISOString(),
                        });
                    }
                }
            }

            if (usedItems.length > 0) {
                const nowIso = new Date().toISOString();
                const logEntry = {
                    job: job.jobName.trim() || 'N/A',
                    customer: job.customer,
                    usedAt: nowIso,
                    createdAt: nowIso,
                    status: 'Completed',
                    details: usedItems,
                    qty: -usedItems.length,
                };
                batch.set(logDocRef, logEntry);
            }
        }

        await batch.commit();
    };

    const handleFulfillScheduledLog = async (logToFulfill) => {
        try {
            const batch = writeBatch(db);
            const itemsNeeded = logToFulfill.details.reduce((acc, item) => {
                const key = `${item.materialType}|${item.length}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            // Prepare selection based on current in-memory inventory
            const selectedSheets = [];
            for (const [key, qty] of Object.entries(itemsNeeded)) {
                const [materialType, lengthStr] = key.split('|');
                const length = parseInt(lengthStr, 10);

                const availableSheets = inventory
                    .filter(i => i.materialType === materialType && i.length === length && i.status === 'On Hand')
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                if (availableSheets.length < qty) {
                    throw new Error(`Cannot fulfill: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`);
                }
                selectedSheets.push(...availableSheets.slice(0, qty));
            }

            const nowIso = new Date().toISOString();
            for (const s of selectedSheets) {
                const r = doc(db, `artifacts/${appId}/public/data/inventory`, s.id);
                batch.update(r, {
                    status: 'Used',
                    usageLogId: logToFulfill.id,
                    jobNameUsed: logToFulfill.job || 'N/A',
                    customerUsed: logToFulfill.customer || 'N/A',
                    usedAt: nowIso,
                });
            }

            const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, logToFulfill.id);
            batch.update(logDocRef, {
                status: 'Completed',
                details: selectedSheets,
                qty: -selectedSheets.length,
                fulfilledAt: nowIso,
            });

            await batch.commit();
        } catch (error) {
            console.error("Fulfillment Error:", error);
            alert(`Failed to fulfill order: ${error.message}`);
        }
    };

    const handleManageCategory = async (categoryName, materialsFromModal, mode) => {
        const materialsCollectionRef = collection(db, `artifacts/${appId}/public/data/materials`);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

        try {
            const allMaterialsSnapshot = await getDocs(materialsCollectionRef);
            const allMaterials = {};
            allMaterialsSnapshot.forEach(docSnap => {
                // Use canonical Firestore IDs as names to avoid mismatches
                allMaterials[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            });

            const batch = writeBatch(db);

            if (mode === 'add') {
                for (const material of materialsFromModal) {
                    if (!material.name || !material.thickness || !material.density) continue;
                    if (allMaterials[material.name]) {
                        throw new Error(`A material named "${material.name}" already exists.`);
                    }
                    const normalizedIndicatorSettings = normalizeCategoryIndicatorSettings(material);
                    const materialId = material.name.replace(/\//g, '-');
                    const newMaterialRef = doc(materialsCollectionRef, materialId);
                    batch.set(newMaterialRef, {
                        category: categoryName,
                        thickness: parseFloat(material.thickness),
                        density: parseFloat(material.density),
                        visualLowThreshold: normalizedIndicatorSettings.low,
                        visualHighThreshold: normalizedIndicatorSettings.high,
                    });
                }
                await batch.commit();
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
            for (const origId of Object.keys(originalById)) {
                if (!keepOriginalIds.has(origId)) {
                    batch.delete(doc(materialsCollectionRef, origId));
                }
            }

            for (const modalMaterial of materialsFromModal) {
                const hasAllFields = modalMaterial.name && modalMaterial.thickness && modalMaterial.density;
                if (!hasAllFields) continue;

                const newThickness = parseFloat(modalMaterial.thickness);
                const newDensity = parseFloat(modalMaterial.density);
                const normalizedIndicatorSettings = normalizeCategoryIndicatorSettings(modalMaterial);

                if (modalMaterial.isNew) {
                    const newName = modalMaterial.name.trim();
                    if (allMaterials[newName]) {
                        throw new Error(`A material named "${newName}" already exists.`);
                    }
                    const newId = newName.replace(/\//g, '-');
                    const newRef = doc(materialsCollectionRef, newId);
                    batch.set(newRef, {
                        category: categoryName,
                        thickness: newThickness,
                        density: newDensity,
                        visualLowThreshold: normalizedIndicatorSettings.low,
                        visualHighThreshold: normalizedIndicatorSettings.high,
                    });
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
                    batch.set(newRef, {
                        category: categoryName,
                        thickness: newThickness,
                        density: newDensity,
                        visualLowThreshold: normalizedIndicatorSettings.low,
                        visualHighThreshold: normalizedIndicatorSettings.high,
                    });

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
                            batch.update(doc(inventoryCollectionRef, itemDoc.id), { materialType: newId });
                        });
                    }

                    batch.delete(doc(materialsCollectionRef, originalDocId));
                } else if (
                    existing.thickness !== newThickness ||
                    existing.density !== newDensity ||
                    existing.visualLowThreshold !== normalizedIndicatorSettings.low ||
                    existing.visualHighThreshold !== normalizedIndicatorSettings.high
                ) {
                    batch.update(doc(materialsCollectionRef, originalDocId), {
                        thickness: newThickness,
                        density: newDensity,
                        visualLowThreshold: normalizedIndicatorSettings.low,
                        visualHighThreshold: normalizedIndicatorSettings.high,
                    });
                }
            }
            await batch.commit();
        } catch (error) {
            console.error("Transaction failed: ", error);
            throw error;
        }
    };


    const handleAddSupplier = (supplier, info) => {
        setSuppliers(prev => [...prev, supplier]);
        if (info) {
            const key = (supplier || '').toUpperCase().replace(/\s+/g, '_');
            setSupplierInfo(prev => ({ ...prev, [key]: info }));
        }
    };

    const handleDeleteSupplier = (supplier) => {
        setSuppliers(prev => prev.filter(s => s !== supplier));
        const key = (supplier || '').toUpperCase().replace(/\s+/g, '_');
        setSupplierInfo(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const handleUpdateSupplierInfo = (supplierName, info) => {
        const key = (supplierName || '').toUpperCase().replace(/\s+/g, '_');
        setSupplierInfo((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...info } }));
    };

    const handleAddOrEditOrder = async (jobs, originalOrderGroup = null, options = {}) => {
        const isEditing = !!originalOrderGroup;
        const batch = writeBatch(db);

        if (isEditing) {
            originalOrderGroup.details.forEach(item => {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                batch.delete(docRef);
            });
        }

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        jobs.forEach(job => {
            const jobName = job.jobName.trim() || 'N/A';
            job.items.forEach(item => {
                const arrivalDateString = job.useItemArrivalDates ? item.arrivalDate : job.arrivalDate;
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
                        batch.set(newDocRef, { ...stockData, width: 48, length: len });
                    }
                });

                const customQty = parseInt(item.customQty || 0, 10);
                const customWidth = parseFloat(item.customWidth || 0);
                const customLength = parseFloat(item.customLength || 0);
                if (customQty > 0 && customWidth > 0 && customLength > 0) {
                    for (let i = 0; i < customQty; i++) {
                        const newDocRef = doc(inventoryCollectionRef);
                        batch.set(newDocRef, { ...stockData, width: customWidth, length: customLength });
                    }
                }
            });
        });
        if (options.linkedBuyOrderId) {
            batch.update(doc(db, BUY_ORDERS_PATH, options.linkedBuyOrderId), {
                workflowStatus: 'received',
                receivedAt: new Date().toISOString(),
            });
        }

        await batch.commit();
    };

    const handleSubmitBuyOrder = useCallback(async (jobs) => {
        const job = jobs?.[0];
        if (!job) {
            throw new Error('A buy order requires at least one job.');
        }
        const selectedSuppliers = Array.isArray(job.suppliers)
            ? job.suppliers.filter(Boolean)
            : (job.supplier ? [job.supplier] : []);
        if (selectedSuppliers.length === 0) {
            throw new Error('Select at least one supplier before opening buy-order emails.');
        }

        const normalizedItems = normalizeOrderItemsForStorage(job.items);
        const customBody = buildBuyOrderEmailBody(normalizedItems);
        const createdAt = new Date().toISOString();
        const requestedEmailSubject = (job.emailSubject || '').trim();
        const emailDrafts = selectedSuppliers.map((supplier) => ({
            supplier,
            ...createSupplierMailtoLink({
                supplier,
                supplierInfoOverrides: supplierInfo,
                customBody,
                customSubject: requestedEmailSubject,
            }),
        }));
        const blockedEmailDrafts = openMailtoLinks(emailDrafts);

        const buyOrderRef = doc(collection(db, BUY_ORDERS_PATH));
        await setDoc(buyOrderRef, {
            jobName: '',
            customer: job.customer || '',
            supplier: selectedSuppliers[0] || '',
            suppliers: selectedSuppliers,
            status: 'Ordered',
            workflowStatus: 'emailed',
            createdAt,
            arrivalDate: null,
            openedEmailAt: createdAt,
            receivedAt: null,
            items: normalizedItems,
            requestedEmailSubject,
            emailSubject: requestedEmailSubject || (emailDrafts[0]?.subject || 'Quote Request'),
            emailBody: emailDrafts[0]?.body || customBody,
            emailDrafts: emailDrafts.map(({ supplier, subject, body, info }) => ({
                supplier,
                email: info?.email || '',
                ccEmail: info?.ccEmail || '',
                subject,
                body,
            })),
        });
        if (blockedEmailDrafts.length > 0) {
            setModal({ type: 'buy-order-drafts', data: { drafts: blockedEmailDrafts } });
        } else {
            closeModal();
        }
        return { closeModalOnSuccess: false };
    }, [closeModal, supplierInfo]);

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
        const logSnap = await getDoc(logDocRef);
        if (!logSnap.exists()) {
            return;
        }

        const logData = logSnap.data();
        const isCompleted = (logData.status || 'Completed') === 'Completed';
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const batch = writeBatch(db);

        if (isCompleted) {
            const usedInventorySnap = await getDocs(
                query(inventoryCollectionRef, where('usageLogId', '==', logId))
            );

            usedInventorySnap.forEach((itemDoc) => {
                batch.update(doc(inventoryCollectionRef, itemDoc.id), {
                    status: 'On Hand',
                    usageLogId: null,
                    jobNameUsed: null,
                    customerUsed: null,
                    usedAt: null
                });
            });
        }

        batch.delete(logDocRef);
        await batch.commit();
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

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const batch = writeBatch(db);

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
                batch.set(newDocRef, stockData);
            }
        } else {
            const sheetsToRemove = Math.abs(diff);
            const availableSheets = inventory
                .filter(
                    item => item.materialType === materialType &&
                        item.length === length &&
                        item.status === 'On Hand'
                )
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            if (availableSheets.length < sheetsToRemove) {
                throw new Error(`Cannot remove ${sheetsToRemove} sheets. Only ${availableSheets.length} available.`);
            }

            const sheetsToDelete = availableSheets.slice(0, sheetsToRemove);
            const refs = sheetsToDelete.map(s => doc(db, `artifacts/${appId}/public/data/inventory`, s.id));

            // WRITES
            for (const r of refs) {
                batch.delete(r);
            }
        }

        await batch.commit();
    };

    const handleEditOutgoingLog = async (originalLog, newLogData) => {
        const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, originalLog.id);

        // Always fetch the latest log status from Firestore to avoid relying on derived objects
        const latestSnap = await getDoc(logDocRef);
        const latestLog = latestSnap.exists() ? { id: latestSnap.id, ...latestSnap.data() } : originalLog;
        const latestStatus = (latestLog.status || 'Completed');

        if (latestStatus === 'Scheduled') {
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

            // Build target date at local midnight to avoid timezone drift
            const targetDate = new Date(`${newLogData.date}T00:00:00`);
            const now = new Date();

            // If the scheduled date is today or earlier, fulfill immediately
            if (targetDate <= now) {
                const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
                const batch = writeBatch(db);

                // Determine items needed by type/length
                const itemsNeeded = newDetails.reduce((acc, d) => {
                    const key = `${d.materialType}|${d.length}`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});

                const selectedSheets = [];
                for (const [key, qty] of Object.entries(itemsNeeded)) {
                    const [materialType, lengthStr] = key.split('|');
                    const length = parseInt(lengthStr, 10);
                    const availableSheets = inventory
                        .filter(i => i.materialType === materialType && i.length === length && i.status === 'On Hand')
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    if (availableSheets.length < qty) {
                        throw new Error(`Cannot fulfill: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`);
                    }
                    selectedSheets.push(...availableSheets.slice(0, qty));
                }

                // Store the concrete sheet snapshots so the inventory timeline can keep the original add counts.
                const usedAtIso = new Date().toISOString();
                for (const sheet of selectedSheets) {
                    batch.update(doc(inventoryCollectionRef, sheet.id), {
                        status: 'Used',
                        usageLogId: latestLog.id,
                        jobNameUsed: newLogData.jobName.trim() || 'N/A',
                        customerUsed: newLogData.customer,
                        usedAt: usedAtIso,
                    });
                }

                batch.update(logDocRef, {
                    job: newLogData.jobName.trim() || 'N/A',
                    customer: newLogData.customer,
                    status: 'Completed',
                    details: selectedSheets,
                    qty: -selectedSheets.length,
                    usedAt: usedAtIso,
                    fulfilledAt: usedAtIso,
                });

                await batch.commit();
            } else {
                // Save as scheduled at end-of-day to avoid immediate auto-fulfill
                const scheduledUsedAtIso = new Date(`${newLogData.date}T23:59:59`).toISOString();
                await updateDoc(logDocRef, {
                    job: newLogData.jobName.trim() || 'N/A',
                    customer: newLogData.customer,
                    usedAt: scheduledUsedAtIso,
                    details: newDetails,
                    qty: -totalItems,
                    status: 'Scheduled',
                    fulfilledAt: null,
                });
            }
        } else {
            // Logic for editing a COMPLETED log
            const now = new Date();
            // Build target date at local midnight to avoid timezone drift
            const targetDate = newLogData.date ? new Date(`${newLogData.date}T00:00:00`) : null;
            const shouldRevertToScheduled = targetDate && targetDate > now;

            if (shouldRevertToScheduled) {
                const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
                const batch = writeBatch(db);

                // Return currently used items for this log (that still exist) back to On Hand
                const originalItemIds = (latestLog.details || []).map(d => d.id).filter(Boolean);
                const returnRefs = originalItemIds.map((id) => doc(inventoryCollectionRef, id));

                // WRITES: make them On Hand
                for (const r of returnRefs) {
                    batch.update(r, {
                        status: 'On Hand',
                        usageLogId: null,
                        jobNameUsed: null,
                        customerUsed: null,
                        usedAt: null,
                    });
                }

                // For any items that no longer exist or are not revertable, recreate a matching sheet back to On Hand
                const validReturnIds = new Set(returnRefs.map(ref => ref.id));
                const missingDetails = (latestLog.details || []).filter(d => d.id && !validReturnIds.has(d.id));
                const nowIso = new Date().toISOString();
                for (const d of missingDetails) {
                    const recreated = {
                        materialType: d.materialType,
                        gauge: d.gauge ?? getGaugeFromMaterial(d.materialType),
                        supplier: d.supplier || 'Rescheduled Return',
                        costPerPound: d.costPerPound || 0,
                        createdAt: nowIso,
                        job: d.job || 'N/A',
                        status: 'On Hand',
                        arrivalDate: null,
                        dateReceived: nowIso.slice(0, 10),
                        width: d.width || 48,
                        length: d.length,
                        density: d.density ?? materials[d.materialType]?.density ?? 0,
                        thickness: d.thickness ?? materials[d.materialType]?.thickness ?? 0,
                    };
                    const newRef = doc(inventoryCollectionRef);
                    batch.set(newRef, recreated);
                }

                // Build new scheduled details (no concrete sheet IDs)
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

                // Schedule at end-of-day to avoid immediate auto-fulfill
                const localYmd = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
                const scheduledUsedAtIso = new Date(`${localYmd}T23:59:59`).toISOString();
                batch.update(logDocRef, {
                    job: newLogData.jobName.trim() || 'N/A',
                    customer: newLogData.customer,
                    usedAt: scheduledUsedAtIso,
                    details: newDetails,
                    qty: -totalItems,
                    status: 'Scheduled',
                    fulfilledAt: null,
                });
                
                await batch.commit();
                return;
            }

            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

                const netChange = {};
                (latestLog.details || []).forEach(item => {
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

                const originalDetails = (latestLog.details || []).filter(d => d.id);
                const originalItemIds = originalDetails.map(d => d.id);
                const originalItemsByKey = {};
                const desiredCounts = {};

                originalDetails.forEach(detail => {
                    const key = `${detail.materialType}|${detail.length}`;
                    if (!originalItemsByKey[key]) originalItemsByKey[key] = [];
                    originalItemsByKey[key].push(detail);
                });

                newLogData.items.forEach(item => {
                    STANDARD_LENGTHS.forEach(len => {
                        const qty = parseInt(item[`qty${len}`] || 0, 10);
                        if (qty > 0) {
                            const key = `${item.materialType}|${len}`;
                            desiredCounts[key] = (desiredCounts[key] || 0) + qty;
                        }
                    });
                });

                const keptOriginalDetails = [];
                const returnDetailIds = new Set();

                Object.entries(originalItemsByKey).forEach(([key, details]) => {
                    const desiredQty = desiredCounts[key] || 0;
                    const keepCount = Math.min(details.length, desiredQty);
                    keptOriginalDetails.push(...details.slice(0, keepCount));
                    details.slice(keepCount).forEach(detail => returnDetailIds.add(detail.id));
                });

                const keptOriginalRefs = keptOriginalDetails.map(detail => doc(inventoryCollectionRef, detail.id));
                const returnRefs = Array.from(returnDetailIds).map(id => doc(inventoryCollectionRef, id));

                // Only allocate additional stock for the deficit after reusing matching sheets already on this log.
                const plannedNewRefs = [];
                Object.entries(desiredCounts).forEach(([key, desiredQty]) => {
                    const keptCount = keptOriginalDetails.filter(detail => `${detail.materialType}|${detail.length}` === key).length;
                    const neededQty = desiredQty - keptCount;
                    if (neededQty <= 0) return;

                    const [materialType, lengthStr] = key.split('|');
                    const len = parseInt(lengthStr, 10);
                    const matchingSheets = inventory
                        .filter(i => i.materialType === materialType && i.length === len && i.status === 'On Hand' && !originalItemIds.includes(i.id))
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                    const sheetsToUse = matchingSheets.slice(0, neededQty);
                    if (sheetsToUse.length < neededQty) {
                        throw new Error(`Concurrency Error: Not enough stock for ${materialType} @ ${len}" during edit.`);
                    }
                    sheetsToUse.forEach(sheet => plannedNewRefs.push(doc(inventoryCollectionRef, sheet.id)));
                });

                const batch = writeBatch(db);
                
                const keptItemsForLog = keptOriginalDetails;
                const updatedUsedItemsForLog = [];
                const validReturnRefs = returnRefs;

                for (const r of plannedNewRefs) {
                    const sheet = inventory.find(i => i.id === r.id);
                    if (sheet) {
                        updatedUsedItemsForLog.push({ id: r.id, ...sheet });
                    }
                }

                const usedAtIso = newLogData.date
                    ? new Date(newLogData.date + 'T00:00:00').toISOString()
                    : (latestLog.usedAt || new Date().toISOString());
                const usageUpdate = {
                    status: 'Used',
                    usageLogId: latestLog.id,
                    jobNameUsed: newLogData.jobName,
                    customerUsed: newLogData.customer,
                    usedAt: usedAtIso,
                };

                // WRITES: return extras, refresh kept items, then use newly allocated sheets
                for (const r of validReturnRefs) {
                    batch.update(r, {
                        status: 'On Hand',
                        usageLogId: null,
                        jobNameUsed: null,
                        customerUsed: null,
                        usedAt: null,
                    });
                }

                for (const r of keptOriginalRefs) {
                    batch.update(r, usageUpdate);
                }

                for (const r of plannedNewRefs) {
                    batch.update(r, usageUpdate);
                }

                const finalUsedItemsForLog = [...keptItemsForLog, ...updatedUsedItemsForLog];
                batch.update(logDocRef, {
                    job: newLogData.jobName,
                    customer: newLogData.customer,
                    details: finalUsedItemsForLog,
                    qty: -finalUsedItemsForLog.length,
                    usedAt: usedAtIso,
                });
                
                await batch.commit();
        }
    };

    const openModalForEdit = (transaction) => {
        const modalType = transaction.isAddition ? 'edit-order' : 'edit-log';
        setModal({ type: modalType, data: transaction });
    };



    const buyPanelInDashboard = modal.type === 'buy' && activeView === 'dashboard';

    const prevActiveViewRef = useRef(activeView);
    useEffect(() => {
        const prev = prevActiveViewRef.current;
        prevActiveViewRef.current = activeView;
        if (prev === 'dashboard' && activeView !== 'dashboard' && modal.type === 'buy') {
            closeModal();
        }
    }, [activeView, modal.type, closeModal]);

    const renderActiveView = () => {
        switch (activeView) {
            case 'dashboard':
                return (
                    <DndContext
                        collisionDetection={closestCenter}
                        onDragStart={isEditMode ? handleDragStart : undefined}
                        onDragEnd={isEditMode ? handleDragEnd : undefined}
                        onDragCancel={isEditMode ? handleDragCancel : undefined}
                    >
                        <div className="flex flex-col xl:flex-row gap-8 items-stretch xl:items-start">
                            <div className="min-w-0 flex-1">
                                <DashboardView
                                    inventorySummary={inventorySummary}
                                    incomingSummary={incomingSummary}
                                    scheduledOutgoingSummary={scheduledOutgoingSummary}
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
                                    materialIndicatorSettings={materialIndicatorSettings}
                                />
                            </div>
                            {buyPanelInDashboard && (
                                <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:self-start xl:w-[min(100%,34rem)]">
                                    <AddOrderModal
                                        variant="panel"
                                        onClose={closeModal}
                                        onSave={handleSubmitBuyOrder}
                                        title="Buy Material"
                                        materialTypes={materialTypes}
                                        materials={materials}
                                        suppliers={suppliers}
                                        prefill={modal.data?.prefill}
                                        mode="buy"
                                    />
                                </aside>
                            )}
                        </div>
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
                return <PriceHistoryView inventory={inventory} materials={materials} searchQuery={searchQuery} />;
            case 'sheet-calculator':
                return <SheetCostCalculatorView />;
            case 'reorder':
                return <ReorderView
                    inventorySummary={inventorySummary}
                    materials={materials}
                    onRestock={handleRestock}
                    buyOrders={openBuyOrders}
                    onAddBuyOrderToInventory={handleAddBuyOrderToInventory}
                    onClearAllBuyOrders={handleClearAllBuyOrders}
                    onDeleteBuyOrder={handleDeleteBuyOrder}
                    searchQuery={searchQuery}
                    inventory={inventory}
                    suppliers={suppliers}
                    supplierInfoOverrides={supplierInfo}
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
                         isEditMode={isEditMode}
                    />;
                }
                return null;
        }
    };

    if (!userId) {
        const denied = authAccessDenied;
        const deniedMsg = authDeniedDetail;
        return (
            <AuthView
                authReady={authReady}
                accessDenied={denied}
                deniedDetail={deniedMsg}
                onClearAccessDenied={clearAuthAccessDenied}
            />
        );
    }

    return (
        <div className="bg-zinc-900 min-h-screen font-sans text-zinc-200">
            <div className="container mx-auto p-4 md:p-8">
                <Header
                    ref={searchInputRef}
                    onAdd={() => setModal({ type: 'add' })}
                    onBuy={() => handleOpenBuyModal()}
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
                    onOpenAuthentication={() => setModal({ type: 'authentication' })}
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

                {showLoading ? <LoadingSpinner /> : renderActiveView()}

                <footer className="text-center text-zinc-500 mt-8 text-sm">
                    <p>TecnoPan Inventory System</p>
                    <p>
                        User:{' '}
                        <span className="font-mono bg-zinc-800 px-2 py-1 rounded">
                            {authUser?.email || userId}
                        </span>
                    </p>
                </footer>
            </div>

            {/* Debug Panel - Firestore usage tracker */}
            <DebugPanel />

            {AI_ASSISTANT_ENABLED && (
                <>
                    <button
                        type="button"
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
                </>
            )}



            {modal.type === 'add' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, null, { linkedBuyOrderId: modal.data?.linkedBuyOrderId })} materialTypes={materialTypes} materials={materials} suppliers={suppliers} prefill={modal.data?.prefill} />}
            {modal.type === 'buy' && !buyPanelInDashboard && (
                <AddOrderModal
                    onClose={closeModal}
                    onSave={handleSubmitBuyOrder}
                    title="Buy Material"
                    materialTypes={materialTypes}
                    materials={materials}
                    suppliers={suppliers}
                    prefill={modal.data?.prefill}
                    mode="buy"
                />
            )}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" materialTypes={materialTypes} materials={materials} suppliers={suppliers} />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} onSave={handleUseStock} inventory={inventory} materialTypes={materialTypes} materials={materials} inventorySummary={inventorySummary} incomingSummary={incomingSummary} suppliers={suppliers} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} onSave={handleEditOutgoingLog} inventory={inventory} materialTypes={materialTypes} />}
            {modal.type === 'manage-categories' && <ManageCategoriesModal onClose={closeModal} onSave={handleManageCategory} categories={initialCategories} materials={materials} refetchMaterials={refetchMaterials} materialIndicatorSettings={materialIndicatorSettings} />}
            {modal.type === 'manage-suppliers' && <ManageSuppliersModal onClose={closeModal} suppliers={suppliers} supplierInfo={supplierInfo} onAddSupplier={handleAddSupplier} onDeleteSupplier={handleDeleteSupplier} onUpdateSupplierInfo={handleUpdateSupplierInfo} />}
            {modal.type === 'buy-order-drafts' && <BuyOrderDraftsModal onClose={closeModal} drafts={modal.data?.drafts || []} />}
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
            {modal.type === 'authentication' && <AuthenticationModal onClose={closeModal} />}
        </div>
    );
}