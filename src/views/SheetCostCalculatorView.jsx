// src/views/SheetCostCalculatorView.jsx

import React, { useMemo, useState } from 'react';
import { STANDARD_LENGTHS } from '../constants/materials';

const DEFAULT_DENSITIES = {
    Steel: 0.2833, // lb/in^3
    Aluminum: 0.0975,
};

function formatCurrency(value) {
    if (Number.isNaN(value) || !Number.isFinite(value)) return '—';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function computeSheetCost(thicknessInches, costPerPound, densityLbPerIn3, widthInches, lengthInches) {
    const t = parseFloat(thicknessInches);
    const cpp = parseFloat(costPerPound);
    const d = parseFloat(densityLbPerIn3);
    const w = parseFloat(widthInches);
    const l = parseFloat(lengthInches);

    if ([t, cpp, d, w, l].some(v => Number.isNaN(v) || v <= 0)) return null;

    const volumeIn3 = w * l * t; // in^3
    const weightLb = volumeIn3 * d; // lb
    const cost = weightLb * cpp;
    return { cost, weightLb };
}

export const SheetCostCalculatorView = () => {
    const [thickness, setThickness] = useState('');
    const [costPerPound, setCostPerPound] = useState('');
    const [materialKind, setMaterialKind] = useState('Steel');
    const [customDensity, setCustomDensity] = useState('0.2833');
    const [customWidth, setCustomWidth] = useState('48');
    const [customLength, setCustomLength] = useState('96');

    const effectiveDensity = useMemo(() => {
        if (materialKind === 'Custom') return parseFloat(customDensity) || 0;
        return DEFAULT_DENSITIES[materialKind] || 0.2833;
    }, [materialKind, customDensity]);

    const standardCosts = useMemo(() => {
        return STANDARD_LENGTHS.map(len => {
            const result = computeSheetCost(thickness, costPerPound, effectiveDensity, 48, len);
            return { length: len, width: 48, result };
        });
    }, [thickness, costPerPound, effectiveDensity]);

    const customCost = useMemo(() => {
        return computeSheetCost(thickness, costPerPound, effectiveDensity, customWidth, customLength);
    }, [thickness, costPerPound, effectiveDensity, customWidth, customLength]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-1 space-y-6">
                <div className="bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Inputs</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Thickness (in)</label>
                            <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={thickness}
                                onChange={e => setThickness(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                placeholder="e.g. 0.060"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Cost per Pound ($/lb)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={costPerPound}
                                onChange={e => setCostPerPound(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                placeholder="e.g. 1.25"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Material Density</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                {['Steel', 'Aluminum', 'Custom'].map(kind => (
                                    <button
                                        key={kind}
                                        onClick={() => setMaterialKind(kind)}
                                        className={`px-3 py-2 rounded border text-sm font-semibold transition-colors ${materialKind === kind ? 'bg-blue-800 border-blue-700 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
                                    >
                                        {kind}
                                    </button>
                                ))}
                            </div>
                            <div className="text-xs text-zinc-400">
                                <span>Density (lb/in³): </span>
                                <span className="font-mono">{(materialKind === 'Custom' ? (parseFloat(customDensity) || 0) : DEFAULT_DENSITIES[materialKind]).toFixed(4)}</span>
                            </div>
                            {materialKind === 'Custom' && (
                                <div className="mt-2">
                                    <input
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        value={customDensity}
                                        onChange={e => setCustomDensity(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                        placeholder="e.g. 0.2833"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Custom Sheet</h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Width (in)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={customWidth}
                                onChange={e => setCustomWidth(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                placeholder="e.g. 48"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Length (in)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={customLength}
                                onChange={e => setCustomLength(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-700"
                                placeholder="e.g. 96"
                            />
                        </div>
                    </div>

                    <div className="p-4 rounded border bg-zinc-900 border-zinc-700">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-300">Estimated Cost</span>
                            <span className="text-2xl font-extrabold text-white">{customCost?.cost != null ? formatCurrency(customCost.cost) : '—'}</span>
                        </div>
                        {customCost?.weightLb != null && (
                            <div className="mt-1 text-xs text-zinc-500">Weight: {customCost.weightLb.toFixed(1)} lb</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="xl:col-span-2">
                <div className="bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-6">
                    <h2 className="text-xl font-bold text-white mb-2">Standard Sheets</h2>
                    <p className="text-sm text-zinc-400 mb-4">Calculations assume width 48" and lengths {STANDARD_LENGTHS.map(len => `${len}"`).join(', ')}.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {standardCosts.map(({ length, width, result }) => (
                            <div key={length} className="p-4 rounded-lg border bg-zinc-900 border-zinc-700">
                                <div className="text-zinc-400 text-xs mb-1">{width}" × {length}"</div>
                                <div className="text-3xl font-extrabold text-white mb-1">{result?.cost != null ? formatCurrency(result.cost) : '—'}</div>
                                {result?.weightLb != null && (
                                    <div className="text-xs text-zinc-500">Weight: {result.weightLb.toFixed(1)} lb</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


