// Debug panel - live Firestore usage tracker
// Shows reads (received), writes/deletes (sent) vs daily limits

import React, { useState, useEffect } from 'react';
import { Bug, X, RotateCcw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import {
    getStats,
    subscribe,
    resetDaily,
    FIRESTORE_LIMITS,
} from '../../utils/firestoreUsageTracker';

function ProgressBar({ value, limit, label, color }) {
    const pct = Math.min(100, (value / limit) * 100);
    const isWarning = pct >= 80;
    const isDanger = pct >= 100;
    const barColor = isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : color;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{label}</span>
                <span className={isDanger ? 'text-red-400 font-semibold' : isWarning ? 'text-amber-400' : 'text-zinc-300'}>
                    {value.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                    className={`h-full ${barColor} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export function DebugPanel() {
    const [stats, setStats] = useState(getStats);
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(true);

    useEffect(() => {
        return subscribe(setStats);
    }, []);

    const handleReset = () => {
        if (window.confirm('Reset today\'s usage count? (Does not affect Firebase; local estimate only)')) {
            resetDaily();
        }
    };

    const handleExport = () => {
        const blob = new Blob(
            [JSON.stringify({ ...stats, exportedAt: new Date().toISOString() }, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `firestore-usage-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed bottom-20 left-4 z-40">
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                    title="Open Firestore Debug Panel"
                >
                    <Bug size={18} />
                    <span className="hidden sm:inline">Debug</span>
                    <span className="text-amber-400 font-mono text-xs">
                        {stats.reads}R / {stats.writes}W
                    </span>
                </button>
            ) : (
                <div className="w-72 sm:w-80 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl overflow-hidden">
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-600 cursor-pointer"
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                            <Bug size={18} />
                            Firestore Usage
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleExport();
                                }}
                                className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
                                title="Export"
                            >
                                <Download size={16} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleReset();
                                }}
                                className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
                                title="Reset count"
                            >
                                <RotateCcw size={16} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }}
                                className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>

                    {!isMinimized && (
                        <div className="p-3 space-y-4">
                            <p className="text-xs text-zinc-500">
                                Live estimate of Firestore ops (reads = received, writes/deletes = sent). Resets daily.
                            </p>

                            <ProgressBar
                                value={stats.reads}
                                limit={FIRESTORE_LIMITS.reads}
                                label="Reads (received)"
                                color="bg-blue-500"
                            />
                            <ProgressBar
                                value={stats.writes}
                                limit={FIRESTORE_LIMITS.writes}
                                label="Writes (sent)"
                                color="bg-green-500"
                            />
                            <ProgressBar
                                value={stats.deletes}
                                limit={FIRESTORE_LIMITS.deletes}
                                label="Deletes (sent)"
                                color="bg-orange-500"
                            />

                            <div className="pt-2 border-t border-zinc-700 text-xs text-zinc-500">
                                Free tier: 50k reads, 20k writes, 20k deletes/day
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
