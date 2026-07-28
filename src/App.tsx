// src/App.jsx

import React, { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { writeBatch, doc, collection, updateDoc, getDocs, query, where, getDoc, setDoc, onSnapshot, orderBy, limit, runTransaction } from './firebase/firestoreWithTracking';
import Fuse from 'fuse.js';
import { db, appId, auth, signOut } from './firebase/config';
import { useFirestoreData } from './hooks/useFirestoreData';
import { useSuppliersSync } from './hooks/useSuppliersSync';
import { usePersistentState } from './hooks/usePersistentState';
import {
    calculateInventorySummary,
    calculateIncomingSummary,
    calculateScheduledOutgoingSummary,
    formatUseStockJobLabel,
    getGaugeFromMaterial,
    groupLogsByJob
} from './utils/dataProcessing';
import { STANDARD_LENGTHS } from './constants/materials';
import { buildBuyOrderEmailBody, createSupplierMailtoLink } from './utils/buyOrderUtils';
import { repairCountIssues } from './utils/countRepair';
import { buildMaterialIndicatorSettingsMap, normalizeCategoryIndicatorSettings } from './utils/categoryIndicatorSettings';
import { localDateInputValue, parseLocalDate, startOfDayIso, endOfDayIso } from './utils/dates';
import { AI_ASSISTANT_ENABLED } from './constants/featureFlags';

// Layout & Common Components
import { Header } from './components/layout/Header';
import { ViewTabs } from './components/layout/ViewTabs';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';
import { SearchResultsDropdown } from './components/common/SearchResultsDropdown';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { Bot } from 'lucide-react';

// Views: keep auth + dashboard eager for fastest first paint; lazy-load the rest.
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';

const LogsView = lazy(() => import('./views/LogsView').then((m) => ({ default: m.LogsView })));
const MaterialDetailView = lazy(() => import('./views/MaterialDetailView').then((m) => ({ default: m.MaterialDetailView })));
const PriceHistoryView = lazy(() => import('./views/PriceHistoryView').then((m) => ({ default: m.PriceHistoryView })));
const JobOverviewView = lazy(() => import('./views/JobOverviewView').then((m) => ({ default: m.JobOverviewView })));
const SheetCostCalculatorView = lazy(() => import('./views/SheetCostCalculatorView').then((m) => ({ default: m.SheetCostCalculatorView })));


// Modals: lazy-loaded — code loads when opened (smaller initial bundle).
const AddOrderModal = lazy(() => import('./components/modals/AddOrderModal').then((m) => ({ default: m.AddOrderModal })));
const UseStockModal = lazy(() => import('./components/modals/UseStockModal').then((m) => ({ default: m.UseStockModal })));
const EditOutgoingLogModal = lazy(() => import('./components/modals/EditOutgoingLogModal').then((m) => ({ default: m.EditOutgoingLogModal })));
const ManageCategoriesModal = lazy(() => import('./components/modals/ManageCategoriesModal').then((m) => ({ default: m.ManageCategoriesModal })));
const BackupModal = lazy(() => import('./components/modals/BackupModal').then((m) => ({ default: m.BackupModal })));
const AuthenticationModal = lazy(() => import('./components/modals/AuthenticationModal').then((m) => ({ default: m.AuthenticationModal })));
const ManageSuppliersModal = lazy(() => import('./components/modals/ManageSuppliersModal').then((m) => ({ default: m.ManageSuppliersModal })));
const BuyOrderDraftsModal = lazy(() => import('./components/modals/BuyOrderDraftsModal').then((m) => ({ default: m.BuyOrderDraftsModal })));
const AddStockModal = lazy(() => import('./components/modals/AddStockModal').then((m) => ({ default: m.AddStockModal })));

const AIAssistant = lazy(() => import('./components/assistant/AIAssistant').then((m) => ({ default: m.AIAssistant })));

const BUY_ORDERS_PATH = `artifacts/${appId}/public/data/buy_orders`;
const LATEST_BUY_ORDER_LIMIT = 15;

function createManualEditSessionId() {
    return `manual-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOrderItemsForStorage(items: any[] = []) {
    return items.map((item: any) => ({
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

function getBuyOrderPrimarySupplier(buyOrder: any) {
    if (buyOrder?.supplier) {
        return buyOrder.supplier;
    }

    if (Array.isArray(buyOrder?.suppliers)) {
        return buyOrder.suppliers.find(Boolean) || '';
    }

    return '';
}

function triggerMailto(mailto: any) {
    const link = document.createElement('a');
    link.href = mailto;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** Thrown when stock changed between the in-memory snapshot and the transactional write. */
class StockConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StockConflictError';
    }
}

/**
 * Atomically reserve On Hand sheets inside a Firestore transaction.
 *
 * Sheets are pre-selected FIFO from the in-memory snapshot (the caller supplies
 * `candidateIds`, ideally a few more than `qty` as a buffer). This re-reads each
 * candidate inside the transaction and returns, per requirement, the first `qty`
 * that are STILL `On Hand` and not already chosen in this transaction — so two
 * clients can never consume the same physical sheet. It only READS, so it must be
 * called before any `tx` writes (Firestore requires all reads before writes).
 *
 * Throws {@link StockConflictError} when a requirement can no longer be satisfied
 * (candidates were consumed elsewhere since the snapshot was taken).
 */
async function reserveOnHandSheets(
    tx: any,
    inventoryCollectionRef: any,
    requirements: Array<{ materialType: string; length: number; qty: number; candidateIds: string[] }>
): Promise<any[][]> {
    const uniqueIds = Array.from(new Set(requirements.flatMap((r) => r.candidateIds)));
    const snaps = await Promise.all(uniqueIds.map((id) => tx.get(doc(inventoryCollectionRef, id))));
    const dataById = new Map<string, any>();
    snaps.forEach((snap: any, i: number) => {
        dataById.set(uniqueIds[i], snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });

    const claimedInTxn = new Set<string>();
    const picksPerRequirement: any[][] = [];
    for (const req of requirements) {
        const picked: any[] = [];
        for (const id of req.candidateIds) {
            if (picked.length === req.qty) break;
            if (claimedInTxn.has(id)) continue;
            const data = dataById.get(id);
            if (data && data.status === 'On Hand') {
                claimedInTxn.add(id);
                picked.push(data);
            }
        }
        if (picked.length < req.qty) {
            throw new StockConflictError(
                `Stock for ${req.materialType} @ ${req.length}" changed before it could be saved (needed ${req.qty}, only ${picked.length} still available). Please refresh and try again.`
            );
        }
        picksPerRequirement.push(picked);
    }
    return picksPerRequirement;
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
    const [modal, setModal] = useState<any>({ type: null, data: null, error: null });
    const [isEditMode, setIsEditMode] = useState(false);
    const [manualEditSessionId, setManualEditSessionId] = useState<string | null>(null);
    const [scrollToMaterial, setScrollToMaterial] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [categoriesToDelete, setCategoriesToDelete] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedJobFromSearch, setSelectedJobFromSearch] = useState<any>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [fuse, setFuse] = useState<any>(null);
    const [isAssistantVisible, setIsAssistantVisible] = useState(false);
    const [openBuyOrders, setOpenBuyOrders] = useState<any[]>([]);

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
    } = useFirestoreData();

    /** Audit identity stamped on log/inventory writes — the signed-in account. */
    const auditActor = () => authUser?.email || authUser?.displayName || 'Unknown';

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
            (snapshot: any) => {
                const openBuyOrders = snapshot.docs
                    .map((buyOrderDoc: any) => ({ id: buyOrderDoc.id, ...buyOrderDoc.data() }))
                    .filter((buyOrder: any) => !buyOrder.workflowStatus || buyOrder.workflowStatus === 'emailed');

                setOpenBuyOrders(openBuyOrders);
            },
            (err: any) => {
                console.error('Failed to load buy orders:', err);
                setOpenBuyOrders([]);
            }
        );
    }, [userId]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults([]);
        setActiveIndex(0);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: any) => {
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

    const initialCategories = useMemo(() => [...new Set(Object.values<any>(materials).map(m => m.category))], [materials]);
    const [categories, setCategories] = usePersistentState('dashboard-category-order', initialCategories);
    const manageCategoriesCategoryOptions = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const c of categories) {
            if (c && !seen.has(c)) {
                seen.add(c);
                out.push(c);
            }
        }
        for (const c of initialCategories) {
            if (c && !seen.has(c)) {
                seen.add(c);
                out.push(c);
            }
        }
        return out;
    }, [categories, initialCategories]);
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
    const showLoading = loading || !inventoryReady;

    const handleSignOut = useCallback(async () => {
        try {
            clearAuthAccessDenied();
            await signOut(auth);
        } catch (e) {
            console.error('Sign out failed:', e);
        }
    }, [clearAuthAccessDenied]);

    const handleStartEditing = useCallback(() => {
        setManualEditSessionId(createManualEditSessionId());
        setIsEditMode(true);
    }, []);

    const handleFinishEditing = useCallback(() => {
        if (categoriesToDelete.length > 0) {
            setModal({ type: 'confirm-delete-categories', data: categoriesToDelete });
        } else {
            setIsEditMode(false);
            setManualEditSessionId(null);
        }
    }, [categoriesToDelete]);

    useEffect(() => {
        if (loading) return;

        const commands = [
            { type: 'command', name: 'Add Stock', aliases: ['add', 'new', 'order'], action: () => setModal({ type: 'add' }) },
            { type: 'command', name: 'Email Suppliers', aliases: ['buy', 'purchase', 'email supplier'], action: () => setModal({ type: 'buy' }) },
            { type: 'command', name: 'Use Stock', aliases: ['use'], action: () => setModal({ type: 'use' }) },
            { type: 'command', name: 'Manage Categories', aliases: ['mc', 'manage cat'], action: () => setModal({ type: 'manage-categories' }) },
            { type: 'command', name: 'Manage Suppliers', aliases: ['ms', 'manage sup'], action: () => setModal({ type: 'manage-suppliers' }) },
            { type: 'command', name: 'Edit/Finish', aliases: ['edit', 'finish'], action: () => isEditMode ? handleFinishEditing() : handleStartEditing(), view: 'dashboard' },
            { type: 'command', name: 'Sign Out', aliases: ['sign out', 'logout', 'log off'], action: () => handleSignOut() },
            { type: 'command', name: 'Authentication', aliases: ['auth', 'allowlist', 'whitelist'], action: () => setModal({ type: 'authentication' }) },
        ];

        const views = [
            { type: 'view', name: 'Dashboard', id: 'dashboard' },
            { type: 'view', name: 'Jobs', id: 'jobs' },
            { type: 'view', name: 'Logs', id: 'logs' },
            { type: 'view', name: 'Price History', id: 'price-history' },
            { type: 'view', name: 'Sheet Calculator', id: 'sheet-calculator' },
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

    }, [loading, materials, inventory, usageLog, initialCategories, isEditMode, allJobs, materialTypes, handleFinishEditing, handleStartEditing, handleSignOut]);


    const handleSearchChange = (e: any) => {
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
    };

    const handleResultSelect = (result: any) => {
        const item = result.item;
        switch (item.type) {
            case 'command':
                // View-scoped commands (e.g. Edit/Finish) navigate there first instead of silently doing nothing.
                if (item.view && activeView !== item.view) {
                    setActiveView(item.view);
                }
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

    const handleSearchKeyDown = (e: any) => {
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

    const handleOpenBuyModal = useCallback((prefill: any = null) => {
        setModal({ type: 'buy', data: prefill ? { prefill } : null });
    }, []);

    const handleAddBuyOrderToInventory = useCallback((buyOrder: any) => {
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

    const handleClearAllBuyOrders = useCallback(() => {
        if (openBuyOrders.length === 0) {
            return;
        }
        setModal({ type: 'confirm-clear-buy-orders', data: null });
    }, [openBuyOrders.length]);

    const returnToAddStockList = useCallback(() => setModal({ type: 'add', data: null }), []);

    const handleConfirmClearAllBuyOrders = useCallback(async () => {
        if (openBuyOrders.length === 0) {
            returnToAddStockList();
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
        returnToAddStockList();
    }, [openBuyOrders, returnToAddStockList]);

    const handleDeleteBuyOrder = useCallback((buyOrder: any) => {
        if (!buyOrder?.id) {
            return;
        }
        setModal({ type: 'confirm-delete-buy-order', data: buyOrder });
    }, []);

    const handleConfirmDeleteBuyOrder = useCallback(async () => {
        const buyOrder = modal.data;
        if (!buyOrder?.id) {
            returnToAddStockList();
            return;
        }
        try {
            await updateDoc(doc(db, BUY_ORDERS_PATH, buyOrder.id), {
                workflowStatus: 'cleared',
                clearedAt: new Date().toISOString(),
            });
        } catch (err) {
            console.error('Failed to remove buy order:', err);
        }
        returnToAddStockList();
    }, [modal.data, returnToAddStockList]);

    const handleDragStart = (event: any) => setActiveCategory(event.active.id);
    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setCategories((items) => arrayMove(items, items.indexOf(active.id), items.indexOf(over.id)));
        }
        setActiveCategory(null);
    };
    const handleDragCancel = () => setActiveCategory(null);

    const handleToggleCategoryForDeletion = (categoryName: any) => {
        setCategoriesToDelete(prev =>
            prev.includes(categoryName)
                ? prev.filter(c => c !== categoryName)
                : [...prev, categoryName]
        );
    };

    const handleDeleteSingleCategory = useCallback(async (categoryName: any) => {
        try {
            const materialsToDelete = Object.values<any>(materials).filter(m => m.category === categoryName);
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

            setCategories(prev => prev.filter(c => c !== categoryName));
            if (refetchMaterials) await refetchMaterials();
        } catch (err) {
            console.error('Error deleting category:', err);
            throw err;
        }
    }, [materials, inventory, refetchMaterials, setCategories]);

    const handleConfirmDeleteCategories = async () => {
        try {
            const toRemove = categoriesToDelete;
            const materialsToDelete = Object.values<any>(materials).filter(m => toRemove.includes(m.category));
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

            setCategories((prev) => prev.filter((c) => !toRemove.includes(c)));
            setCategoriesToDelete([]);
            setIsEditMode(false);
            setManualEditSessionId(null);
            closeModal();
            setActiveView('dashboard');
            if (refetchMaterials) await refetchMaterials();
        } catch (err) {
            console.error("Error deleting categories:", err);
            setModal((prev: any) => ({ ...prev, error: "Failed to delete categories. Please try again." }));
        }
    };

    const handleUseStock = async (jobs: any, options: any) => {
        const { isScheduled, scheduledDate } = options;
        const batch = writeBatch(db);
        const usageLogCollectionRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

        const resolveUseStockJobLabel = (job: any) => {
            const fromParts = formatUseStockJobLabel(job.jobNumber, job.jobSection, job.joinWith);
            if (fromParts) return fromParts;
            return (job.jobName || '').trim() || 'N/A';
        };

        // If scheduling, we only write the log entries
        if (isScheduled) {
            for (const job of jobs) {
                const itemsForLog = [];
                let totalItems = 0;

                for (const item of job.items) {
                    for (const len of STANDARD_LENGTHS) {
                        const qty = parseInt(item[`qty${len}`] || 0, 10);
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
                    const scheduledUsedAtIso = endOfDayIso(scheduledDate);
                    const logEntry = {
                        job: resolveUseStockJobLabel(job),
                        customer: job.customer,
                        createdAt: new Date().toISOString(),
                        usedAt: scheduledUsedAtIso,
                        status: 'Scheduled',
                        details: itemsForLog,
                        qty: -totalItems,
                        createdBy: auditActor(),
                    };
                    batch.set(logDocRef, logEntry);
                }
            }
            await batch.commit();
            return;
        }

        // Use Now: select FIFO from the in-memory snapshot, then CLAIM in a transaction
        // that re-reads each sheet and verifies it is still On Hand — so two clients (or
        // tabs) can never consume the same physical sheet. `allocatedSnapshotIds` keeps a
        // submission's own items from picking the same sheet twice; the extra candidates
        // (qty + buffer) let the transaction self-heal when a few snapshot sheets were
        // taken since the last refresh.
        const CLAIM_CANDIDATE_BUFFER = 5;
        const allocatedSnapshotIds = new Set<string>();
        const jobPlans = jobs
            .map((job: any) => {
                const requirements: Array<{ materialType: string; length: number; qty: number; candidateIds: string[] }> = [];
                for (const item of job.items) {
                    for (const len of STANDARD_LENGTHS) {
                        const qty = parseInt(item[`qty${len}`] || '0', 10);
                        if (qty <= 0) continue;
                        const matchingSheets = inventory
                            .filter((i: any) => i.materialType === item.materialType && i.length === len && i.status === 'On Hand' && !allocatedSnapshotIds.has(i.id))
                            .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                        if (matchingSheets.length < qty) {
                            throw new Error(`Not enough stock for ${qty}x ${item.materialType} @ ${len}". Only ${matchingSheets.length} available.`);
                        }
                        matchingSheets.slice(0, qty).forEach((s: any) => allocatedSnapshotIds.add(s.id));
                        requirements.push({
                            materialType: item.materialType,
                            length: len,
                            qty,
                            candidateIds: matchingSheets.slice(0, qty + CLAIM_CANDIDATE_BUFFER).map((s: any) => s.id),
                        });
                    }
                }
                return { job, logRef: doc(usageLogCollectionRef), requirements };
            })
            .filter((p: any) => p.requirements.length > 0);

        if (jobPlans.length === 0) return;

        const nowIso = new Date().toISOString();
        await runTransaction(db, async (tx: any) => {
            const flatReqs: any[] = [];
            const reqPlanIndex: number[] = [];
            jobPlans.forEach((plan: any, pi: number) =>
                plan.requirements.forEach((r: any) => { flatReqs.push(r); reqPlanIndex.push(pi); })
            );

            // All reads first (Firestore requires reads before writes).
            const reserved = await reserveOnHandSheets(tx, inventoryCollectionRef, flatReqs);

            const usedByPlan: any[][] = jobPlans.map(() => [] as any[]);
            reserved.forEach((sheets, ri) => {
                const pi = reqPlanIndex[ri];
                const plan = jobPlans[pi];
                for (const sheet of sheets) {
                    tx.update(doc(inventoryCollectionRef, sheet.id), {
                        status: 'Used',
                        usageLogId: plan.logRef.id,
                        jobNameUsed: resolveUseStockJobLabel(plan.job),
                        customerUsed: plan.job.customer,
                        usedAt: nowIso,
                    });
                    usedByPlan[pi].push({ ...sheet, status: 'Used' });
                }
            });

            jobPlans.forEach((plan: any, pi: number) => {
                const used = usedByPlan[pi];
                if (used.length > 0) {
                    tx.set(plan.logRef, {
                        job: resolveUseStockJobLabel(plan.job),
                        customer: plan.job.customer,
                        usedAt: nowIso,
                        createdAt: nowIso,
                        status: 'Completed',
                        details: used,
                        qty: -used.length,
                        createdBy: auditActor(),
                    });
                }
            });
        });
    };

    const handleFulfillScheduledLog = async (logToFulfill: any) => {
        try {
            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
            const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, logToFulfill.id);

            const itemsNeeded: Record<string, number> = (logToFulfill.details || []).reduce((acc: Record<string, number>, item: any) => {
                const key = `${item.materialType}|${item.length}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            // Select FIFO from the in-memory snapshot (plus a buffer); the actual claim
            // re-verifies each sheet inside the transaction.
            const CLAIM_CANDIDATE_BUFFER = 5;
            const allocatedSnapshotIds = new Set<string>();
            const requirements: Array<{ materialType: string; length: number; qty: number; candidateIds: string[] }> = [];
            for (const [key, qty] of Object.entries(itemsNeeded)) {
                const [materialType, lengthStr] = key.split('|');
                const length = parseInt(lengthStr, 10);
                const availableSheets = inventory
                    .filter((i: any) => i.materialType === materialType && i.length === length && i.status === 'On Hand' && !allocatedSnapshotIds.has(i.id))
                    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                if (availableSheets.length < qty) {
                    throw new Error(`Cannot fulfill: Not enough stock for ${qty}x ${materialType} @ ${length}". Only ${availableSheets.length} available.`);
                }
                availableSheets.slice(0, qty).forEach((s: any) => allocatedSnapshotIds.add(s.id));
                requirements.push({
                    materialType,
                    length,
                    qty,
                    candidateIds: availableSheets.slice(0, qty + CLAIM_CANDIDATE_BUFFER).map((s: any) => s.id),
                });
            }

            const nowIso = new Date().toISOString();
            await runTransaction(db, async (tx: any) => {
                // Re-read the log first and bail if it was already fulfilled or rescheduled
                // since this click (mirrors the auto-fulfill freshness guard).
                const freshLog = await tx.get(logDocRef);
                if (!freshLog.exists() || (freshLog.data().status || 'Completed') !== 'Scheduled') {
                    throw new StockConflictError('This scheduled order was already fulfilled or changed elsewhere. Please refresh and try again.');
                }

                const selectedSheets = (await reserveOnHandSheets(tx, inventoryCollectionRef, requirements)).flat();

                for (const sheet of selectedSheets) {
                    tx.update(doc(inventoryCollectionRef, sheet.id), {
                        status: 'Used',
                        usageLogId: logToFulfill.id,
                        jobNameUsed: logToFulfill.job || 'N/A',
                        customerUsed: logToFulfill.customer || 'N/A',
                        usedAt: nowIso,
                    });
                }

                tx.update(logDocRef, {
                    status: 'Completed',
                    details: selectedSheets.map((s: any) => ({ ...s, status: 'Used' })),
                    qty: -selectedSheets.length,
                    fulfilledAt: nowIso,
                    lastEditedBy: auditActor(),
                    lastEditedAt: nowIso,
                });
            });
        } catch (error: any) {
            console.error("Fulfillment Error:", error);
            setModal({
                type: 'fulfill-error',
                data: { message: error?.message ? `Failed to fulfill order: ${error.message}` : 'Failed to fulfill order.' },
            });
        }
    };

    const handleManageCategory = async (categoryName: any, materialsFromModal: any, mode: any) => {
        const materialsCollectionRef = collection(db, `artifacts/${appId}/public/data/materials`);
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

        try {
            const allMaterialsSnapshot = await getDocs(materialsCollectionRef);
            const allMaterials: Record<string, any> = {};
            allMaterialsSnapshot.forEach((docSnap: any) => {
                // Use canonical Firestore IDs as names to avoid mismatches
                allMaterials[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            });

            const batch = writeBatch(db);
            let batchHasWrites = false;

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
                    batchHasWrites = true;
                }
                if (batchHasWrites) await batch.commit();
                return;
            }

            // Edit existing category materials
            const originalById = Object.fromEntries(
                Object.entries<any>(allMaterials)
                    .filter(([id, m]) => m.category === categoryName)
                    .map(([id, m]) => [id, { ...m, name: id }])
            );

            // Determine deletions (materials removed entirely)
            const keepOriginalIds = new Set(
                materialsFromModal.filter((m: any) => !m.isNew && m.id).map((m: any) => m.id)
            );
            const removedMaterialIds: string[] = [];
            for (const origId of Object.keys(originalById)) {
                if (!keepOriginalIds.has(origId)) {
                    batch.delete(doc(materialsCollectionRef, origId));
                    removedMaterialIds.push(origId);
                    batchHasWrites = true;
                }
            }
            if (removedMaterialIds.length > 0) {
                const idMatchesType = (mt: any) =>
                    removedMaterialIds.includes(mt) ||
                    removedMaterialIds.some(
                        rid => mt === rid.replace(/-/g, '/') || mt === rid.replace(/\//g, '-')
                    );
                for (const item of inventory) {
                    if (idMatchesType(item.materialType)) {
                        batch.delete(doc(inventoryCollectionRef, item.id));
                        batchHasWrites = true;
                    }
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
                    batchHasWrites = true;
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
                    batchHasWrites = true;

                    // Update inventory documents referencing the old name in any historical format
                    const oldVariants = Array.from(new Set([
                        resolvedOriginalName,
                        resolvedOriginalName.replace(/-/g, '/'),
                        resolvedOriginalName.replace(/\//g, '-')
                    ]));
                    for (const oldName of oldVariants) {
                        const invQuery = query(inventoryCollectionRef, where("materialType", "==", oldName));
                        const invSnapshot = await getDocs(invQuery);
                        for (const itemDoc of invSnapshot.docs) {
                            batch.update(doc(inventoryCollectionRef, itemDoc.id), { materialType: newId });
                            batchHasWrites = true;
                        }
                    }

                    batch.delete(doc(materialsCollectionRef, originalDocId));
                    batchHasWrites = true;
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
                    batchHasWrites = true;
                }
            }
            if (batchHasWrites) await batch.commit();
        } catch (error) {
            console.error("Transaction failed: ", error);
            throw error;
        }
    };


    const handleAddSupplier = (supplier: any, info: any) => {
        setSuppliers(prev => [...prev, supplier]);
        if (info) {
            const key = (supplier || '').toUpperCase().replace(/\s+/g, '_');
            setSupplierInfo(prev => ({ ...prev, [key]: info }));
        }
    };

    const handleDeleteSupplier = (supplier: any) => {
        setSuppliers(prev => prev.filter(s => s !== supplier));
        const key = (supplier || '').toUpperCase().replace(/\s+/g, '_');
        setSupplierInfo(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const handleUpdateSupplierInfo = (supplierName: any, info: any) => {
        const key = (supplierName || '').toUpperCase().replace(/\s+/g, '_');
        setSupplierInfo((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...info } }));
    };

    const handleAddOrEditOrder = async (jobs: any, originalOrderGroup: any = null, options: any = {}) => {
        const isEditing = !!originalOrderGroup;
        const batch = writeBatch(db);

        if (isEditing) {
            (originalOrderGroup.details || []).forEach((item: any) => {
                if (!item?.id) return;
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                batch.delete(docRef);
            });
            (originalOrderGroup.sourceLogIds || []).forEach((logId: any) => {
                batch.delete(doc(db, `artifacts/${appId}/public/data/usage_logs`, logId));
            });
        }

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        jobs.forEach((job: any) => {
            const jobName = job.jobName.trim() || 'N/A';
            job.items.forEach((item: any) => {
                const arrivalDateString = job.useItemArrivalDates ? item.arrivalDate : job.arrivalDate;

                const stockData = {
                    materialType: item.materialType,
                    gauge: getGaugeFromMaterial(item.materialType),
                    supplier: job.supplier,
                    costPerPound: parseFloat(item.costPerPound || 0),
                    createdAt: (job.createdAt ? startOfDayIso(job.createdAt) : (isEditing ? (originalOrderGroup.date || originalOrderGroup.dateOrdered) : new Date().toISOString())),
                    job: jobName,
                    status: job.status,
                    // Incoming stock becomes available at the START of its arrival day.
                    arrivalDate: job.status === 'Ordered' ? startOfDayIso(arrivalDateString) : null,
                    dateReceived: null,
                    createdBy: isEditing ? (originalOrderGroup.createdBy || auditActor()) : auditActor(),
                    ...(isEditing ? { lastEditedBy: auditActor(), lastEditedAt: new Date().toISOString() } : {}),
                };

                STANDARD_LENGTHS.forEach(len => {
                    const qty = parseInt(item[`qty${len}`] || 0, 10);
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

    const handleSubmitBuyOrder = useCallback(async (jobs: any) => {
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
        const emailDrafts = selectedSuppliers.map((supplier: any) => ({
            supplier,
            ...createSupplierMailtoLink({
                supplier,
                supplierInfoOverrides: supplierInfo,
                customBody,
                customSubject: requestedEmailSubject,
            }),
        }));
        const validDrafts = emailDrafts.filter((draft: any) => draft?.mailto);

        // A single supplier opens straight into the mail client (reliable within
        // this click). Multiple suppliers can't all be launched from one click —
        // popup blockers stop every draft after the first — so we present a
        // dialog with one "Open Email" button per supplier instead.
        if (validDrafts.length === 1) {
            triggerMailto(validDrafts[0].mailto);
        }

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
            emailDrafts: emailDrafts.map(({ supplier, subject, body, info }: any) => ({
                supplier,
                email: info?.email || '',
                ccEmail: info?.ccEmail || '',
                subject,
                body,
            })),
        });
        if (validDrafts.length > 1) {
            setModal({ type: 'buy-order-drafts', data: { drafts: validDrafts } });
        } else {
            closeModal();
        }
        return { closeModalOnSuccess: false };
    }, [closeModal, supplierInfo]);

    const handleDeleteInventoryGroup = async (group: any) => {
        const details = group?.details || [];
        const sourceLogIds = group?.sourceLogIds || [];
        if (!details.length && !sourceLogIds.length) return;
        const batch = writeBatch(db);
        details.forEach((item: any) => {
            if (!item?.id) return;
            const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
            batch.delete(docRef);
        });
        sourceLogIds.forEach((logId: any) => {
            batch.delete(doc(db, `artifacts/${appId}/public/data/usage_logs`, logId));
        });
        await batch.commit();
    };

    const handleDeleteLog = async (logId: any) => {
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

            usedInventorySnap.forEach((itemDoc: any) => {
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

    const handleReceiveOrder = async (orderGroup: any) => {
        const batch = writeBatch(db);
        orderGroup.details.forEach((item: any) => {
            if (item.id) {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                batch.update(docRef, {
                    status: 'On Hand',
                    // A received sheet is no longer "incoming", so drop its expected
                    // arrival date — otherwise it lingers as a future date on an
                    // On Hand order (see groupInventoryByJob / MaterialDetailItem).
                    arrivalDate: null,
                    dateReceived: localDateInputValue(),
                    lastEditedBy: auditActor(),
                    lastEditedAt: new Date().toISOString(),
                });
            }
        });
        await batch.commit();
    };

    const handleStockEdit = async (materialType: any, length: any, newQuantity: any) => {
        const currentQuantity = inventorySummary[materialType]?.[length] || 0;
        const diff = newQuantity - currentQuantity;

        if (diff === 0) return;

        const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
        const usageLogCollectionRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();
        const editSessionId = manualEditSessionId || createManualEditSessionId();

        if (diff > 0) {
            const materialInfo = materials[materialType];
            const stockData = {
                materialType: materialType,
                gauge: getGaugeFromMaterial(materialType),
                supplier: 'Manual Edit',
                costPerPound: 0,
                createdAt: nowIso,
                job: `MODIFICATION: ADD`,
                status: 'On Hand',
                dateReceived: localDateInputValue(),
                width: 48,
                length: length,
                density: materialInfo?.density || 0,
                thickness: materialInfo?.thickness || 0,
                manualEditSessionId: editSessionId,
                createdBy: auditActor(),
            };
            for (let i = 0; i < diff; i++) {
                const newDocRef = doc(inventoryCollectionRef);
                batch.set(newDocRef, stockData);
            }
            await batch.commit();
            return;
        }

        // diff < 0: claim the sheets to remove transactionally, re-verifying each is
        // still On Hand so a manual edit can never consume a sheet another client just used.
        const sheetsToRemove = Math.abs(diff);
        const CLAIM_CANDIDATE_BUFFER = 5;
        const candidates = inventory
            .filter((item: any) =>
                item.materialType === materialType &&
                item.length === length &&
                item.status === 'On Hand'
            )
            .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (candidates.length < sheetsToRemove) {
            throw new Error(`Cannot remove ${sheetsToRemove} sheets. Only ${candidates.length} available.`);
        }

        const removeRequirement = {
            materialType,
            length,
            qty: sheetsToRemove,
            candidateIds: candidates.slice(0, sheetsToRemove + CLAIM_CANDIDATE_BUFFER).map((s: any) => s.id),
        };
        const logDocRef = doc(usageLogCollectionRef);
        await runTransaction(db, async (tx: any) => {
            const [reservedSheets] = await reserveOnHandSheets(tx, inventoryCollectionRef, [removeRequirement]);
            for (const sheet of reservedSheets) {
                tx.update(doc(inventoryCollectionRef, sheet.id), {
                    status: 'Used',
                    usageLogId: logDocRef.id,
                    jobNameUsed: 'MODIFICATION: REMOVE',
                    customerUsed: 'Manual Edit',
                    usedAt: nowIso,
                    manualEditSessionId: editSessionId,
                });
            }
            tx.set(logDocRef, {
                job: 'MODIFICATION: REMOVE',
                customer: 'Manual Edit',
                usedAt: nowIso,
                createdAt: nowIso,
                status: 'Completed',
                details: reservedSheets.map((s: any) => ({ ...s, status: 'Used' })),
                qty: -reservedSheets.length,
                manualEditSessionId: editSessionId,
                createdBy: auditActor(),
            });
        });
    };

    const handleEditOutgoingLog = async (originalLog: any, newLogData: any) => {
        const logDocRef = doc(db, `artifacts/${appId}/public/data/usage_logs`, originalLog.id);

        // Always fetch the latest log status from Firestore to avoid relying on derived objects
        const latestSnap = await getDoc(logDocRef);
        const latestLog = latestSnap.exists() ? { id: latestSnap.id, ...latestSnap.data() } : originalLog;
        const latestStatus = (latestLog.status || 'Completed');

        if (latestStatus === 'Scheduled') {
            const newDetails: any[] = [];
            let totalItems = 0;
            for (const item of newLogData.items) {
                for (const len of STANDARD_LENGTHS) {
                    const qty = parseInt(item[`qty${len}`] || 0, 10);
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

            // Use the same end-of-day boundary as creation and the auto-fulfiller,
            // so a given calendar date becomes "due" at the same instant everywhere.
            // (A bare midnight check fulfilled "today" immediately, unlike creation.)
            const now = new Date();
            const scheduledUsedAtIso = endOfDayIso(newLogData.date);
            const dueNow = scheduledUsedAtIso && new Date(scheduledUsedAtIso) <= now;

            // If the scheduled date is fully in the past, fulfill immediately.
            if (dueNow) {
                const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
                const batch = writeBatch(db);

                // Determine items needed by type/length
                const itemsNeeded: Record<string, number> = newDetails.reduce((acc: Record<string, number>, d: any) => {
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
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
                    details: selectedSheets.map(s => ({ ...s, status: 'Used' })),
                    qty: -selectedSheets.length,
                    usedAt: usedAtIso,
                    fulfilledAt: usedAtIso,
                    lastEditedBy: auditActor(),
                    lastEditedAt: usedAtIso,
                });

                await batch.commit();
            } else {
                // Save as scheduled at end-of-day. Use a transaction so the new date
                // can't be silently lost to a concurrent auto-fulfill: if the log was
                // already fulfilled between opening the editor and saving, abort with a
                // clear error instead of writing over (or losing) the user's reschedule.
                await runTransaction(db, async (tx: any) => {
                    const snap = await tx.get(logDocRef);
                    if (!snap.exists()) {
                        throw new Error('This scheduled log no longer exists. Reload and try again.');
                    }
                    if ((snap.data().status || '') !== 'Scheduled') {
                        throw new Error('This log was just auto-fulfilled, so it can no longer be rescheduled. Reload to edit the completed log instead.');
                    }
                    tx.update(logDocRef, {
                        job: newLogData.jobName.trim() || 'N/A',
                        customer: newLogData.customer,
                        usedAt: scheduledUsedAtIso,
                        details: newDetails,
                        qty: -totalItems,
                        status: 'Scheduled',
                        fulfilledAt: null,
                        lastEditedBy: auditActor(),
                        lastEditedAt: new Date().toISOString(),
                    });
                });
            }
        } else {
            // Logic for editing a COMPLETED log
            const now = new Date();
            // A completed log records the past, so only a date strictly AFTER today
            // (local midnight) reverts it back to a future scheduled use. Re-dating it
            // to today/earlier keeps it completed.
            const targetDate = parseLocalDate(newLogData.date);
            const shouldRevertToScheduled = targetDate && targetDate > now;

            if (shouldRevertToScheduled) {
                const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);
                const batch = writeBatch(db);

                // Return currently used items for this log (that still exist) back to On Hand
                const originalItemIds = (latestLog.details || []).map((d: any) => d.id).filter(Boolean);
                const returnRefs = originalItemIds.map((id: any) => doc(inventoryCollectionRef, id));

                // WRITES: make them On Hand
                for (const r of returnRefs) {
                    batch.update(r, {
                        status: 'On Hand',
                        usageLogId: null,
                        jobNameUsed: null,
                        customerUsed: null,
                        usedAt: null,
                        returnedByLogEdit: true,
                    });
                }

                // For any items that no longer exist or are not revertable, recreate a matching sheet back to On Hand
                const validReturnIds = new Set(returnRefs.map((ref: any) => ref.id));
                const missingDetails = (latestLog.details || []).filter((d: any) => d.id && !validReturnIds.has(d.id));
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
                        dateReceived: localDateInputValue(),
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
                        const qty = parseInt(item[`qty${len}`] || 0, 10);
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
                const scheduledUsedAtIso = endOfDayIso(newLogData.date);
                batch.update(logDocRef, {
                    job: newLogData.jobName.trim() || 'N/A',
                    customer: newLogData.customer,
                    usedAt: scheduledUsedAtIso,
                    details: newDetails,
                    qty: -totalItems,
                    status: 'Scheduled',
                    fulfilledAt: null,
                    lastEditedBy: auditActor(),
                    lastEditedAt: nowIso,
                });

                await batch.commit();
                return;
            }

            const inventoryCollectionRef = collection(db, `artifacts/${appId}/public/data/inventory`);

                const netChange: Record<string, number> = {};
                (latestLog.details || []).forEach((item: any) => {
                    const key = `${item.materialType}|${item.length}`;
                    netChange[key] = (netChange[key] || 0) + 1;
                });
                newLogData.items.forEach((item: any) => {
                    STANDARD_LENGTHS.forEach(len => {
                        const qty = parseInt(item[`qty${len}`] || 0, 10);
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

                const originalDetails = (latestLog.details || []).filter((d: any) => d.id);
                const originalItemIds = originalDetails.map((d: any) => d.id);
                const originalItemsByKey: Record<string, any[]> = {};
                const desiredCounts: Record<string, number> = {};

                originalDetails.forEach((detail: any) => {
                    const key = `${detail.materialType}|${detail.length}`;
                    if (!originalItemsByKey[key]) originalItemsByKey[key] = [];
                    originalItemsByKey[key].push(detail);
                });

                newLogData.items.forEach((item: any) => {
                    STANDARD_LENGTHS.forEach(len => {
                        const qty = parseInt(item[`qty${len}`] || 0, 10);
                        if (qty > 0) {
                            const key = `${item.materialType}|${len}`;
                            desiredCounts[key] = (desiredCounts[key] || 0) + qty;
                        }
                    });
                });

                const keptOriginalDetails: any[] = [];
                const returnDetailIds = new Set<any>();

                Object.entries<any>(originalItemsByKey).forEach(([key, details]) => {
                    // The edit form only exposes standard lengths; custom-length sheets
                    // stay on the log untouched instead of being silently returned.
                    const lengthFromKey = parseInt(key.split('|')[1], 10);
                    if (!STANDARD_LENGTHS.includes(lengthFromKey)) {
                        keptOriginalDetails.push(...details);
                        return;
                    }
                    const desiredQty = desiredCounts[key] || 0;
                    const keepCount = Math.min(details.length, desiredQty);
                    keptOriginalDetails.push(...details.slice(0, keepCount));
                    details.slice(keepCount).forEach((detail: any) => returnDetailIds.add(detail.id));
                });

                const keptOriginalRefs = keptOriginalDetails.map(detail => doc(inventoryCollectionRef, detail.id));
                const returnRefs = Array.from(returnDetailIds).map(id => doc(inventoryCollectionRef, id));

                // Only allocate additional stock for the deficit after reusing matching sheets already on this log.
                const plannedNewRefs: any[] = [];
                Object.entries<any>(desiredCounts).forEach(([key, desiredQty]) => {
                    const keptCount = keptOriginalDetails.filter(detail => `${detail.materialType}|${detail.length}` === key).length;
                    const neededQty = desiredQty - keptCount;
                    if (neededQty <= 0) return;

                    const [materialType, lengthStr] = key.split('|');
                    const len = parseInt(lengthStr, 10);
                    const matchingSheets = inventory
                        .filter(i => i.materialType === materialType && i.length === len && i.status === 'On Hand' && !originalItemIds.includes(i.id))
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
                        updatedUsedItemsForLog.push({ ...sheet, id: r.id });
                    }
                }

                const usedAtIso = newLogData.date
                    ? startOfDayIso(newLogData.date)
                    : (latestLog.usedAt || new Date().toISOString());
                const usageUpdate = {
                    status: 'Used',
                    usageLogId: latestLog.id,
                    jobNameUsed: newLogData.jobName,
                    customerUsed: newLogData.customer,
                    usedAt: usedAtIso,
                    returnedByLogEdit: null,
                };

                // WRITES: return extras, refresh kept items, then use newly allocated sheets
                for (const r of validReturnRefs) {
                    batch.update(r, {
                        status: 'On Hand',
                        usageLogId: null,
                        jobNameUsed: null,
                        customerUsed: null,
                        usedAt: null,
                        returnedByLogEdit: true,
                    });
                }

                for (const r of keptOriginalRefs) {
                    batch.update(r, usageUpdate);
                }

                for (const r of plannedNewRefs) {
                    batch.update(r, usageUpdate);
                }

                const finalUsedItemsForLog = [...keptItemsForLog, ...updatedUsedItemsForLog]
                    .map(d => ({ ...d, status: 'Used' }));
                batch.update(logDocRef, {
                    job: newLogData.jobName,
                    customer: newLogData.customer,
                    details: finalUsedItemsForLog,
                    qty: -finalUsedItemsForLog.length,
                    usedAt: usedAtIso,
                    lastEditedBy: auditActor(),
                    lastEditedAt: new Date().toISOString(),
                });
                
                await batch.commit();
        }
    };

    const openModalForEdit = (transaction: any) => {
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
                                    onMaterialClick={(materialType: any) => {
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
                                        title="Email Suppliers"
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
                    userId={userId}
                    allJobs={allJobs}
                    inventory={inventory}
                    usageLog={usageLog}
                    materials={materials}
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
                    onRepairCountIssues={(issues: any) => repairCountIssues(db, appId, issues, usageLog, `Count Repair (${auditActor()})`)}
                />;
            case 'price-history':
                return <PriceHistoryView inventory={inventory} materials={materials} searchQuery={searchQuery} />;
            case 'sheet-calculator':
                return <SheetCostCalculatorView />;
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
            <div className="container mx-auto p-4 pb-28 md:p-8 md:pb-32">
                {/* Pinned top region: buttons + view tabs + categories all stay
                    at the top. The frosted backdrop (blur + tint) lives on its
                    own layer that is faded with a mask gradient, so the blur AND
                    the tint dissolve together smoothly instead of ending on a
                    hard "frost line". The controls sit on a separate, unmasked
                    layer so they stay fully crisp. pointer-events stay off the
                    fade zone (re-enabled on the controls). */}
                <div className="sticky top-0 z-40 pointer-events-none -mx-4 -mt-4 px-4 pt-4 pb-20 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
                    <div
                        aria-hidden
                        className="absolute inset-0 backdrop-blur-[5px] bg-zinc-900/85 [mask-image:linear-gradient(to_bottom,black_70%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
                    />
                    {/* On large screens the tabs fill the left and the buttons
                        float on the right, vertically centered between the two
                        tab rows (saves the whole empty button line). Below lg it
                        stacks: buttons on top, then the tabs. */}
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                        <div className="pointer-events-auto min-w-0 lg:order-1 lg:flex-1">
                            <ViewTabs activeView={activeView} setActiveView={setActiveView} categories={categories} />
                        </div>
                        <div className="order-first lg:order-2 lg:flex-1 lg:min-w-0">
                            <Header
                                onAdd={() => setModal({ type: 'add' })}
                                onBuy={() => handleOpenBuyModal()}
                                onUse={() => setModal({ type: 'use' })}
                                onEdit={() => isEditMode ? handleFinishEditing() : handleStartEditing()}
                                onSignOut={handleSignOut}
                                isEditMode={isEditMode}
                                onManageCategories={() => setModal({ type: 'manage-categories' })}
                                onManageSuppliers={() => setModal({ type: 'manage-suppliers' })}
                                onOpenBackup={() => setModal({ type: 'backup' })}
                                onOpenAuthentication={() => setModal({ type: 'authentication' })}
                            />
                        </div>
                    </div>
                </div>
                {error && <ErrorMessage message={error} />}

                {showLoading ? <LoadingSpinner /> : (
                    <Suspense fallback={<LoadingSpinner />}>
                        {renderActiveView()}
                    </Suspense>
                )}

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

            {/* Pinned search bar: floats at the bottom. No frosted backdrop —
                just the translucent pill. pointer-events are limited to the pill
                so the surrounding area doesn't block content above it. */}
            <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none pt-12 pb-5">
                <div className="container relative mx-auto px-4 md:px-8">
                    <div className="relative pointer-events-auto mx-auto w-full md:w-1/2 lg:w-1/3">
                        {searchResults.length > 0 && (
                            <SearchResultsDropdown
                                results={searchResults}
                                onSelect={handleResultSelect}
                                activeIndex={activeIndex}
                                setActiveIndex={setActiveIndex}
                            />
                        )}
                        <input
                            ref={searchInputRef}
                            type="search"
                            placeholder="Search anything..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full px-5 py-3 bg-zinc-800/30 border border-zinc-600/40 text-white rounded-full shadow-lg shadow-black/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoComplete="off"
                        />
                    </div>
                </div>
            </div>

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

                    <Suspense fallback={null}>
                        <AIAssistant
                            isVisible={isAssistantVisible}
                            onClose={() => setIsAssistantVisible(false)}
                            inventory={inventory}
                            materials={materials}
                            suppliers={suppliers}
                            usageLog={usageLog}
                            onExecuteOrder={(jobs: any) => handleAddOrEditOrder(jobs)}
                            onOpenModal={(type: any) => setModal({ type })}
                        />
                    </Suspense>
                </>
            )}
            <Suspense fallback={null}>



            {modal.type === 'add' && (
                <AddStockModal
                    onClose={closeModal}
                    onBackToList={() => setModal({ type: 'add', data: null })}
                    onSaveManual={(jobs: any) => handleAddOrEditOrder(jobs, null, { linkedBuyOrderId: modal.data?.linkedBuyOrderId })}
                    onAddBuyOrderToInventory={handleAddBuyOrderToInventory}
                    onAddNonEmailedStock={() => setModal({ type: 'add', data: { manual: true } })}
                    materialTypes={materialTypes}
                    materials={materials}
                    suppliers={suppliers}
                    buyOrders={openBuyOrders}
                    onClearAllBuyOrders={handleClearAllBuyOrders}
                    onDeleteBuyOrder={handleDeleteBuyOrder}
                    prefill={modal.data?.prefill}
                    manual={Boolean(modal.data?.manual)}
                    linkedBuyOrderId={modal.data?.linkedBuyOrderId}
                />
            )}
            {modal.type === 'buy' && !buyPanelInDashboard && (
                <AddOrderModal
                    onClose={closeModal}
                    onSave={handleSubmitBuyOrder}
                    title="Email Suppliers"
                    materialTypes={materialTypes}
                    materials={materials}
                    suppliers={suppliers}
                    prefill={modal.data?.prefill}
                    mode="buy"
                />
            )}
            {modal.type === 'edit-order' && <AddOrderModal onClose={closeModal} onSave={(jobs: any) => handleAddOrEditOrder(jobs, modal.data)} initialData={modal.data} title="Edit Stock Order" materialTypes={materialTypes} materials={materials} suppliers={suppliers} />}
            {modal.type === 'use' && <UseStockModal onClose={closeModal} onSave={handleUseStock} inventory={inventory} materialTypes={materialTypes} materials={materials} inventorySummary={inventorySummary} incomingSummary={incomingSummary} suppliers={suppliers} />}
            {modal.type === 'edit-log' && <EditOutgoingLogModal isOpen={true} onClose={closeModal} logEntry={modal.data} onSave={handleEditOutgoingLog} inventory={inventory} materialTypes={materialTypes} />}
            {modal.type === 'manage-categories' && (
                <ManageCategoriesModal
                    onClose={closeModal}
                    onSave={handleManageCategory}
                    onDeleteCategory={handleDeleteSingleCategory}
                    categories={manageCategoriesCategoryOptions}
                    materials={materials}
                    refetchMaterials={refetchMaterials}
                    materialIndicatorSettings={materialIndicatorSettings}
                />
            )}
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
            {modal.type === 'confirm-clear-buy-orders' && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={returnToAddStockList}
                    onConfirm={handleConfirmClearAllBuyOrders}
                    title="Clear buy orders"
                    message={`Clear all ${openBuyOrders.length} open buy order${openBuyOrders.length === 1 ? '' : 's'}? They will be marked as cleared and removed from this queue.`}
                />
            )}
            {modal.type === 'confirm-delete-buy-order' && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={returnToAddStockList}
                    onConfirm={handleConfirmDeleteBuyOrder}
                    title="Remove buy order"
                    message="Remove this buy order from the queue? It will be marked as cleared."
                />
            )}
            {modal.type === 'fulfill-error' && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={closeModal}
                    onConfirm={closeModal}
                    title="Fulfillment failed"
                    message={modal.data?.message || 'Failed to fulfill order.'}
                    showCancel={false}
                    confirmLabel="OK"
                    confirmVariant="primary"
                />
            )}
            {modal.type === 'backup' && <BackupModal onClose={closeModal} />}
            {modal.type === 'authentication' && <AuthenticationModal onClose={closeModal} />}
            </Suspense>
        </div>
    );
}