// src/components/modals/BackupModal.jsx

import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { HardDriveDownload, RotateCcw, Upload, Download } from 'lucide-react';
import { backupCollections, getLatestBackupInfo, restoreCollectionsFromBackup } from '../../utils/backupService';
import { db, appId } from '../../firebase/config';

export const BackupModal = ({ onClose }) => {
  const [busyMsg, setBusyMsg] = useState('');
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    getLatestBackupInfo(db, appId).then(setLatest).catch(() => {});
  }, []);

  const handleBackupNow = async () => {
    try {
      setBusyMsg('Backing up...');
      const res = await backupCollections(db, appId, ['materials', 'inventory', 'usage_logs']);
      setBusyMsg(`Backup created: ${res.backupId} (${res.totalDocs} docs)`);
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
      await restoreCollectionsFromBackup(db, appId, latest.id, ['materials', 'inventory', 'usage_logs']);
      setBusyMsg(`Restore complete from ${latest.id}`);
    } catch (e) {
      setBusyMsg('');
      setError(e.message || 'Restore failed');
    } finally {
      setTimeout(() => setBusyMsg(''), 4000);
    }
  };

  // Local export: download JSON snapshot of live data
  const handleExportLocal = async () => {
    try {
      setBusyMsg('Exporting local backup...');
      const collections = ['materials', 'inventory', 'usage_logs'];
      const data = {};
      for (const coll of collections) {
        const { collection, getDocs } = await import('firebase/firestore');
        const ref = collection(db, `artifacts/${appId}/public/data/${coll}`);
        const snap = await getDocs(ref);
        data[coll] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify({ appId, createdAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBusyMsg('Local backup saved');
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
          <Button variant="secondary" onClick={handleExportLocal}><Download size={16} /> Save Local Backup</Button>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg cursor-pointer">
            <Upload size={16} /> Restore From Local
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportLocal(e.target.files[0])} />
          </label>
        </div>
        {latest && (
          <p className="text-sm text-zinc-400">Latest: {latest.id} • {latest.createdAt} • {latest.totalDocs} docs</p>
        )}
        {busyMsg && <p className="text-xs text-zinc-400">{busyMsg}</p>}
        {error && <ErrorMessage message={error} />}
      </div>
    </BaseModal>
  );
};


