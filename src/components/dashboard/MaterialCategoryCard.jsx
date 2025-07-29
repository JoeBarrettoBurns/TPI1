// src/components/dashboard/MaterialCategoryCard.jsx

import React, { useState, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STANDARD_LENGTHS } from '../../constants/materials';
import { GripVertical, Trash2, RotateCcw } from 'lucide-react';

export const MaterialCategoryCard = ({ id, category, inventorySummary, incomingSummary, isEditMode, onSave, onMaterialClick, materials, isDragging, onDeleteCategory, isMarkedForDeletion }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging
    } = useSortable({
        id: id,
        disabled: isEditMode, // <-- This disables dragging when in edit mode
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.4 : 1,
        boxShadow: isDragging ? '0 25px 50px -12px rgb(0 0 0 / 0.25)' : '',
    };

    const materialTypes = useMemo(() => Object.keys(materials), [materials]);
    const materialsInCategory = materialTypes.filter(m => materials[m].category === category);

    const [editingCell, setEditingCell] = useState(null);
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

    const cardClasses = isMarkedForDeletion
        ? 'ring-2 ring-red-500 bg-red-900/20'
        : 'border border-slate-700';

    const headerCursor = isEditMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing';

    return (
        <div ref={setNodeRef} style={style} {...attributes} className={`bg-slate-800 rounded-2xl shadow-lg flex flex-col transition-all duration-300 ${cardClasses}`}>
            <div {...listeners} className={`flex justify-between items-center p-6 ${headerCursor}`}>
                <h3 className="text-xl font-bold text-blue-400">{category}</h3>
                <div className="flex items-center gap-2">
                    {isEditMode && (
                        <button
                            onClick={() => onDeleteCategory(category)}
                            className={`p-1 rounded-full transition-colors ${isMarkedForDeletion ? 'text-amber-400 hover:bg-amber-500/20' : 'text-red-400 hover:bg-red-500/20'}`}
                            title={isMarkedForDeletion ? 'Undo marking for deletion' : 'Mark for deletion'}
                        >
                            {isMarkedForDeletion ? <RotateCcw size={18} /> : <Trash2 size={18} />}
                        </button>
                    )}
                    <GripVertical className="text-slate-500" />
                </div>
            </div>
            <div className="overflow-x-auto px-6 pb-6">
                {materialsInCategory.length > 0 ? (
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
                                <tr key={matType} className="border-b border-slate-700 last:border-b-0">
                                    <td onClick={() => onMaterialClick(matType)} className="p-2 font-medium text-slate-300 cursor-pointer hover:text-blue-400">{matType}</td>
                                    {STANDARD_LENGTHS.map(len => {
                                        const isEditingCell = isEditMode && editingCell?.matType === matType && editingCell?.len === len;
                                        const stockCount = inventorySummary[matType]?.[len] || 0;
                                        const incomingCount = incomingSummary[matType]?.lengths[len] || 0;
                                        return (
                                            <td key={len} className="p-2 text-center border-l border-slate-700">
                                                {isEditingCell ? (
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
                ) : (
                    <p className="text-center text-slate-400 py-8">No materials in this category.</p>
                )}
            </div>
        </div>
    );
};