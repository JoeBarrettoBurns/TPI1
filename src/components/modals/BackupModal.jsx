// src/components/modals/BackupModal.jsx

import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { HardDriveDownload, RotateCcw, Upload, Download, List } from 'lucide-react';
import { backupCollections, getLatestBackupInfo, restoreCollectionsFromBackup, listBackups, backfillBackupIndex } from '../../utils/backupService';
import { exportToCSV } from '../../utils/csvExport';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, appId, auth, onAuthStateChanged } from '../../firebase/config';

export const BackupModal = ({ onClose }) => {
  const [busyMsg, setBusyMsg] = useState('');
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);
  const [backups, setBackups] = useState([]);
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [progress, setProgress] = useState(0);

  const [authReady, setAuthReady] = useState(!!auth?.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthReady(!!user));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    getLatestBackupInfo(db, appId).then(async (info) => {
      setLatest(info);
      try {
        await backfillBackupIndex(db, appId);
      } catch {}
    }).catch(() => {});

    // Live updates from current backups location
    const currRef = collection(db, `artifacts/${appId}/public/data/backups`);
    const unsubCurr = onSnapshot(currRef, (snap) => {
      const live = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBackups((prev) => {
        const combined = new Map(prev.map((b) => [b.id, b]));
        live.forEach((b) => combined.set(b.id, b));
        return Array.from(combined.values()).sort((a, b) => (a.id < b.id ? 1 : -1));
      });
    }, (err) => {
      setError(err?.message || 'Failed to read backups');
    });

    // One-time merge of possible legacy backups path
    listBackups(db, appId).then(async (all) => {
      setBackups((prev) => {
        const combined = new Map(prev.map((b) => [b.id, b]));
        all.forEach((b) => combined.set(b.id, b));
        return Array.from(combined.values()).sort((a, b) => (a.id < b.id ? 1 : -1));
      });
      // Best-effort: ensure list docs exist so live subscription updates in future
      try {
        await backfillBackupIndex(db, appId);
      } catch {}
    }).catch(() => {});

    return () => {
      unsubCurr();
    };
  }, [authReady]);

  // Auto-select the most recent backup when the list loads
  useEffect(() => {
    if (!selectedBackupId && backups.length > 0) {
      setSelectedBackupId(backups[0].id);
    }
  }, [backups, selectedBackupId]);

  const handleBackupNow = async () => {
    try {
      setBusyMsg('Backing up...');
      const res = await backupCollections(db, appId, ['materials', 'inventory', 'usage_logs']);
      setBusyMsg(`Backup created: ${res.backupId} (${res.totalDocs} docs)`);
      setSelectedBackupId(res.backupId);
      setLatest({ id: res.backupId, createdAt: new Date().toISOString(), totalDocs: res.totalDocs });
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Backup failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  const handleRestoreLatest = async () => {
    try {
      if (!latest?.id) throw new Error('No backup found');
      if (!window.confirm('This will overwrite current data with the latest backup. Continue?')) return;
      setBusyMsg('Restoring from latest backup...');
      setProgress(0);
      await restoreCollectionsFromBackup(db, appId, latest.id, ['materials', 'inventory', 'usage_logs'], (p) => {
        if (!p) return;
        if (p.phase === 'read') setBusyMsg(`Restoring ${p.collection}: found ${p.count} docs...`);
        if (p.phase?.includes('progress')) setBusyMsg(`Restoring ${p.collection}...`);
        if (p.phase === 'collection-complete') setBusyMsg(`Finished ${p.collection}...`);
        // Simple staged progress: 3 collections → ~33% per collection
        const stageIndex = { materials: 0, inventory: 1, usage_logs: 2 }[p.collection] ?? 0;
        const base = stageIndex * 33.34; // 0, 33.34, 66.68
        const bump = p.phase === 'collection-complete' ? 33.34 : (p.phase?.includes('progress') ? 16.67 : 8);
        setProgress((prev) => Math.min(100, Math.max(prev, Math.floor(base + bump))));
      });
      setProgress(100);
      setBusyMsg(`Restore complete from ${latest.id}`);
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Restore failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  const handleRestoreSpecific = async () => {
    try {
      if (!selectedBackupId) throw new Error('Select a backup');
      if (!window.confirm(`Overwrite current data with backup ${selectedBackupId}?`)) return;
      setBusyMsg(`Restoring ${selectedBackupId}...`);
      setProgress(0);
      await restoreCollectionsFromBackup(db, appId, selectedBackupId, ['materials', 'inventory', 'usage_logs'], (p) => {
        if (!p) return;
        if (p.phase === 'read') setBusyMsg(`Restoring ${p.collection}: found ${p.count} docs...`);
        if (p.phase?.includes('progress')) setBusyMsg(`Restoring ${p.collection}...`);
        if (p.phase === 'collection-complete') setBusyMsg(`Finished ${p.collection}...`);
        const stageIndex = { materials: 0, inventory: 1, usage_logs: 2 }[p.collection] ?? 0;
        const base = stageIndex * 33.34;
        const bump = p.phase === 'collection-complete' ? 33.34 : (p.phase?.includes('progress') ? 16.67 : 8);
        setProgress((prev) => Math.min(100, Math.max(prev, Math.floor(base + bump))));
      });
      setProgress(100);
      setBusyMsg(`Restore complete from ${selectedBackupId}`);
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Restore failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  const handleRefreshBackups = async () => {
    try {
      const all = await listBackups(db, appId);
      setBackups(() => Array.from(new Map(all.map((b) => [b.id, b])).values()).sort((a, b) => (a.id < b.id ? 1 : -1)));
      if (all && all.length > 0) {
        await backfillBackupIndex(db, appId);
      }
    } catch (e) {
      setError(e?.message || 'Failed to refresh backups');
    }
  };

  // Local export: download a JSON system backup (for restore) and an inventory-only CSV (for human reading)
  const handleExportLocal = async () => {
    try {
      setBusyMsg('Exporting local backup (JSON + CSV)...');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const { collection, getDocs } = await import('firebase/firestore');
      // Fetch collections
      const materialsRef = collection(db, `artifacts/${appId}/public/data/materials`);
      const inventoryRef = collection(db, `artifacts/${appId}/public/data/inventory`);
      const logsRef = collection(db, `artifacts/${appId}/public/data/usage_logs`);

      const [materialsSnap, inventorySnap, logsSnap] = await Promise.all([
        getDocs(materialsRef),
        getDocs(inventoryRef),
        getDocs(logsRef),
      ]);

      const materialsData = materialsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const inventoryData = inventorySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const logsData = logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 1) System backup JSON (for restore)
      const backupJson = {
        appId,
        createdAt: new Date().toISOString(),
        data: {
          materials: materialsData,
          inventory: inventoryData,
          usage_logs: logsData,
        },
      };
      const jsonBlob = new Blob([JSON.stringify(backupJson, null, 2)], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const jsonLink = document.createElement('a');
      jsonLink.href = jsonUrl;
      jsonLink.download = `backup-${timestamp}.json`;
      document.body.appendChild(jsonLink);
      jsonLink.click();
      jsonLink.remove();
      URL.revokeObjectURL(jsonUrl);

      // 2) Easy-to-read inventory-only CSV (for humans)
      const inventoryRows = inventoryData.map((item) => ({
        id: item.id,
        materialType: item.materialType ?? '',
        length: item.length ?? '',
        width: item.width ?? '',
        gauge: item.gauge ?? '',
        supplier: item.supplier ?? '',
        costPerPound: item.costPerPound ?? '',
        job: item.job ?? '',
        status: item.status ?? '',
        createdAt: item.createdAt ?? '',
        arrivalDate: item.arrivalDate ?? '',
        dateReceived: item.dateReceived ?? '',
      }));
      const inventoryHeaders = [
        { label: 'ID', key: 'id' },
        { label: 'Material', key: 'materialType' },
        { label: 'Length', key: 'length' },
        { label: 'Width', key: 'width' },
        { label: 'Gauge', key: 'gauge' },
        { label: 'Supplier', key: 'supplier' },
        { label: 'Cost Per Pound', key: 'costPerPound' },
        { label: 'Job/PO', key: 'job' },
        { label: 'Status', key: 'status' },
        { label: 'Created At', key: 'createdAt' },
        { label: 'Arrival Date', key: 'arrivalDate' },
        { label: 'Date Received', key: 'dateReceived' },
      ];
      if (inventoryRows.length > 0) {
        exportToCSV(inventoryRows, inventoryHeaders, `inventory-snapshot-${timestamp}.csv`);
      }

      setBusyMsg('Local backup saved (JSON + CSV)');
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Export failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  // Local import: user selects a JSON file to restore
  const handleImportLocal = async (file) => {
    try {
      setBusyMsg('Importing local backup...');
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.data) throw new Error('Invalid backup file');
      const collections = Object.keys(parsed.data);
      const { writeBatch, doc } = await import('firebase/firestore');
      let total = 0;
      for (const coll of collections) {
        const batch = writeBatch(db);
        const items = parsed.data[coll] || [];
        items.forEach((item) => {
          const id = item.id;
          const { id: _omit, ...rest } = item;
          batch.set(doc(db, `artifacts/${appId}/public/data/${coll}`, id), rest);
        });
        await batch.commit();
        total += items.length;
      }
      setBusyMsg(`Imported ${total} docs from local backup.`);
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Import failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  return (
    <BaseModal onClose={onClose} title="Backups">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleBackupNow}><HardDriveDownload size={16} /> Backup Now</Button>
          <Button variant="secondary" onClick={handleRestoreLatest}><RotateCcw size={16} /> Restore Latest</Button>
          <Button variant="secondary" onClick={handleExportLocal}><Download size={16} /> Save Local Backup (JSON + CSV)</Button>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg cursor-pointer">
            <Upload size={16} /> Restore From Local (JSON)
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportLocal(e.target.files[0])} />
          </label>
        </div>
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <List size={16} className="text-zinc-400" />
            <span className="text-sm text-zinc-300">Available Backups</span>
            <Button variant="secondary" onClick={handleRefreshBackups} className="ml-auto py-1 px-2 text-xs">Refresh</Button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 divide-y divide-zinc-700">
            {backups.length === 0 && !latest?.id && (
              <div className="p-3 text-sm text-zinc-400">No backups found.</div>
            )}
            {backups.length === 0 && latest?.id && (
              <button
                type="button"
                className={`w-full text-left p-3 hover:bg-zinc-700/50 ${selectedBackupId === latest.id ? 'bg-zinc-700/60' : ''}`}
                onClick={() => setSelectedBackupId(latest.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm">{latest.id}</span>
                  <span className="text-xs text-zinc-400">latest</span>
                </div>
              </button>
            )}
            {backups.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`w-full text-left p-3 hover:bg-zinc-700/50 ${selectedBackupId === b.id ? 'bg-zinc-700/60' : ''}`}
                onClick={() => setSelectedBackupId(b.id)}
                title={b.createdAt || ''}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm">{b.id}</span>
                  <span className="text-xs text-zinc-400">{b.totalDocs ? `${b.totalDocs} docs` : ''}</span>
                </div>
                {b.createdAt && (
                  <div className="text-xs text-zinc-500 mt-0.5">{b.createdAt}</div>
                )}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Button variant="secondary" onClick={handleRestoreSpecific} disabled={!selectedBackupId}><RotateCcw size={16} /> Restore Selected</Button>
          </div>
        </div>
        {latest && (
          <p className="text-sm text-zinc-400">Latest: {latest.id} • {latest.createdAt} • {latest.totalDocs} docs</p>
        )}
        {!!busyMsg && <p className="text-xs text-zinc-400">{busyMsg}</p>}
        {progress > 0 && (
          <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <ErrorMessage message={error} />}
      </div>
    </BaseModal>
  );
};


