// src/views/PriceHistoryView.jsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Download, ChevronDown, Check } from 'lucide-react';
import { Button } from '../components/common/Button';
import { exportToCSV } from '../utils/csvExport';
import { calculateSheetCost } from '../utils/dataProcessing';

export const PriceHistoryView = ({ inventory, materials, searchQuery }) => {
    // State to hold the selected material type for filtering
    const [selectedMaterialType, setSelectedMaterialType] = useState('All');

    // Get a sorted list of unique material types
    const materialTypesForFilter = useMemo(() => {
        const types = Object.keys(materials).sort((a, b) => a.localeCompare(b));
        return ['All', ...types];
    }, [materials]);

    // Memoized calculation for the price history data
    const priceHistory = useMemo(() => {
        const lowercasedQuery = (searchQuery || '').toLowerCase();

        // First, filter the raw inventory data
        const filteredInventory = inventory.filter(item => {
            const materialInfo = materials[item.materialType];
            // Ensure the item has the necessary data to be included
            if (!materialInfo || !item.costPerPound || item.costPerPound <= 0) return false;

            // Filter by selected material type
            const matchesMaterial = selectedMaterialType === 'All' || item.materialType === selectedMaterialType;
            if (!matchesMaterial) return false;

            // Filter by search query if it exists
            if (searchQuery) {
                return item.materialType.toLowerCase().includes(lowercasedQuery) ||
                    (item.supplier || '').toLowerCase().includes(lowercasedQuery) ||
                    (item.job || '').toLowerCase().includes(lowercasedQuery);
            }

            return true;
        });

        // Now, create a de-duplicated list of unique price points (ignore dimensions)
        const uniquePricePoints = new Map();
        filteredInventory.forEach(item => {
            const dateKey = (item.dateReceived || item.createdAt).split('T')[0];
            const key = `${item.materialType}-${item.supplier}-${dateKey}-${item.costPerPound}`;

            if (!uniquePricePoints.has(key)) {
                uniquePricePoints.set(key, {
                    id: key,
                    materialType: item.materialType,
                    supplier: item.supplier,
                    job: item.job,
                    dateReceived: item.dateReceived || item.createdAt,
                    costPerPound: item.costPerPound,
                });
            }
        });

        // Sort the final list by date
        return Array.from(uniquePricePoints.values())
            .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));

    }, [inventory, materials, selectedMaterialType, searchQuery]);

    // Handle exporting the current view to a CSV file
    const handleExport = () => {
        const headers = [
            { label: 'Job/PO', key: 'job' },
            { label: 'Material', key: 'materialType' },
            { label: 'Supplier', key: 'supplier' },
            { label: 'Date Received', key: 'dateReceived' },
            { label: 'Cost Per Pound', key: 'costPerPound' },
        ];

        const dataToExport = priceHistory.map(item => ({
            ...item,
            dateReceived: new Date(item.dateReceived).toLocaleDateString(),
            costPerPound: `$${item.costPerPound.toFixed(2)}`
        }));

        exportToCSV(
            dataToExport,
            headers,
            `price_history_material_${selectedMaterialType}.csv`
        );
    };


    // Lightweight custom select to have full control over menu size and styling
    const CompactSelect = ({ value, onChange, options, className = '' }) => {
        const [isOpen, setIsOpen] = useState(false);
        const [highlightIndex, setHighlightIndex] = useState(() => Math.max(0, options.indexOf(value)));
        const containerRef = useRef(null);

        useEffect(() => {
            const handleClickOutside = (event) => {
                if (containerRef.current && !containerRef.current.contains(event.target)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        useEffect(() => {
            setHighlightIndex(Math.max(0, options.indexOf(value)));
        }, [value, options]);

        const getLabel = (opt) => (opt === 'All' ? 'All Materials' : opt);

        const handleKeyDown = (e) => {
            if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setIsOpen(true);
                return;
            }
            if (!isOpen) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIndex((prev) => Math.min(options.length - 1, prev + 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIndex((prev) => Math.max(0, prev - 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onChange(options[highlightIndex]);
                setIsOpen(false);
            } else if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        return (
            <div ref={containerRef} className={`relative ${className}`}>
                <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    onClick={() => setIsOpen((o) => !o)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-zinc-800 text-white border border-zinc-600 rounded-md px-3 py-1.5 text-sm flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                    <span className="truncate">{getLabel(value)}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-300 ml-2" />
                </button>

                {isOpen && (
                    <ul
                        role="listbox"
                        className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800 shadow-lg text-sm custom-scrollbar"
                    >
                        {options.map((opt, idx) => {
                            const selected = opt === value;
                            const highlighted = idx === highlightIndex;
                            return (
                                <li
                                    key={opt}
                                    role="option"
                                    aria-selected={selected}
                                    onMouseEnter={() => setHighlightIndex(idx)}
                                    onMouseDown={(e) => {
                                        // onMouseDown to prevent blur before click registers
                                        e.preventDefault();
                                        onChange(opt);
                                        setIsOpen(false);
                                    }}
                                    className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 ${highlighted ? 'bg-blue-800 text-white' : 'hover:bg-zinc-700/60'} ${selected ? 'font-semibold' : ''}`}
                                >
                                    {selected ? <Check className="w-4 h-4" /> : <span className="w-4 h-4" />}
                                    <span className="truncate">{getLabel(opt)}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    };

    return (
        <div className="bg-zinc-800 rounded-lg shadow-lg p-4 md:p-6 border border-zinc-700">
            <div className="mb-4">
                <div className="flex flex-wrap items-center gap-3 bg-zinc-700/40 border border-zinc-600/40 rounded-md px-3 py-2">
                    <h2 className="text-xl md:text-2xl font-bold text-white mr-3">Price History</h2>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Dropdown for selecting material type */}
                        <CompactSelect
                            value={selectedMaterialType}
                            onChange={setSelectedMaterialType}
                            options={materialTypesForFilter}
                            className="w-full sm:w-72 min-w-[220px]"
                        />
                        <Button onClick={handleExport} variant="secondary" className="shrink-0">
                            <Download size={16} /> <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm md:text-base text-left">
                    <thead>
                        <tr className="border-b border-zinc-700">
                            <th className="p-2 font-semibold text-zinc-400">Date</th>
                            <th className="p-2 font-semibold text-zinc-400">Job/PO</th>
                            <th className="p-2 font-semibold text-zinc-400">Supplier</th>
                            <th className="p-2 font-semibold text-zinc-400">Material</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">Cost Per Pound</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">96</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">120</th>
                            <th className="p-2 font-semibold text-zinc-400 text-right">144</th>
                        </tr>
                    </thead>
                    <tbody>
                        {priceHistory.map((order, index) => {
                            const price96 = calculateSheetCost({ materialType: order.materialType, length: 96, width: 48, costPerPound: order.costPerPound }, materials);
                            const price120 = calculateSheetCost({ materialType: order.materialType, length: 120, width: 48, costPerPound: order.costPerPound }, materials);
                            const price144 = calculateSheetCost({ materialType: order.materialType, length: 144, width: 48, costPerPound: order.costPerPound }, materials);
                            return (
                                <tr key={order.id || index} className={`border-b border-zinc-700 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'}`}>
                                    <td className="p-2">{new Date(order.dateReceived).toLocaleDateString()}</td>
                                    <td className="p-2">{order.job}</td>
                                    <td className="p-2">{order.supplier}</td>
                                    <td className="p-2">{order.materialType}</td>
                                    <td className="p-2 text-right font-mono text-green-400">${order.costPerPound.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price96.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price120.toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono">${price144.toFixed(2)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {priceHistory.length === 0 && <p className="text-center text-zinc-400 py-8">No price history available for this material type or search query.</p>}
            </div>
        </div>
    );
};
