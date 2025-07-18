import React, { useState } from 'react';
import { MATERIAL_TYPES, MATERIALS, STANDARD_LENGTHS } from '../../constants/materials';

export const MaterialCategoryCard = ({ category, inventorySummary, incomingSummary, isEditMode, onSave, onMaterialClick }) => {
    const materialsInCategory = MATERIAL_TYPES.filter(m => MATERIALS[m].category === category);
    const [editingCell, setEditingCell] = useState(null); // { matType, len }
    const [editValue, setEditValue] = useState('');

    const handleEditSave = () => {
        if (!editingCell) return;
        const { matType, len } = editingCell;
        const newQuantity = parseInt(editValue, 10);

        if (!isNaN(newQuantity) && newQuantity >= 0) {
            onSave(matType, len, newQuantity, "Manual Edit");
        }
        setEditingCell(null);
    };

    const getStockCellColor = (count) => {
        if (count <= 5) return 'bg-red-500/20 text-red-200';
        return 'bg-green-500/20 text-green-200';
    };

    if (materialsInCategory.length === 0) return null;

    return (
        <div className="bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-700">
            <h3 className="text-xl font-bold text-blue-400 mb-4">{category}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="p-2 font-semibold text-slate-400">Material</th>
                            {STANDARD_LENGTHS.map(len => (
                                <th key={len} className="p-2 font-semibold text-center text-slate-400 border-l border-slate-700">{len}"x48"</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {materialsInCategory.map(matType => (
                            <tr key={matType} className="border-b border-slate-700">
                                <td onClick={() => onMaterialClick(matType)} className="p-2 font-medium text-slate-300 cursor-pointer hover:text-blue-400">{matType}</td>
                                {STANDARD_LENGTHS.map(len => {
                                    const isEditing = isEditMode && editingCell?.matType === matType && editingCell?.len === len;
                                    const stockCount = inventorySummary[matType]?.[len] || 0;
                                    const incomingCount = incomingSummary[matType]?.[len] || 0;
                                    return (
                                        <td key={len} className="p-2 text-center border-l border-slate-700">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onBlur={handleEditSave}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingCell(null); }}
                                                    className="w-20 text-center bg-slate-600 text-white rounded focus:ring-2 focus:ring-amber-400 outline-none"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span
                                                    onDoubleClick={() => { if (isEditMode) { setEditingCell({ matType, len }); setEditValue(stockCount); } }}
                                                    className={`inline-block font-bold text-lg px-3 py-1 rounded-full ${getStockCellColor(stockCount)} ${isEditMode ? 'cursor-pointer ring-2 ring-amber-500 hover:ring-amber-400' : ''}`}
                                                >
                                                    {stockCount}
                                                </span>
                                            )}
                                            {incomingCount > 0 && (
                                                <div className="text-xs text-yellow-400 mt-1">(+{incomingCount} incoming)</div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};