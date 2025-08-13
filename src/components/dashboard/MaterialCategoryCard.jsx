// src/components/dashboard/MaterialCategoryCard.jsx

import React, { useState, useMemo } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STANDARD_LENGTHS } from '../../constants/materials';
import { GripVertical, Trash2, RotateCcw } from 'lucide-react';
import { useFirestoreDnd } from '../../hooks/useFirestoreDnd';

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
        disabled: isEditMode,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.4 : 1,
    };

    // Defensive: ensure materials is always an object, stabilized for hooks deps
    const safeMaterials = useMemo(() => materials || {}, [materials]);
    const materialTypes = useMemo(() => Object.keys(safeMaterials), [safeMaterials]);
    const materialsInCategory = materialTypes.filter(m => safeMaterials[m]?.category === category);

    const orderedMaterialsInCategory = useMemo(() => {
        // Sort by saved order (from Material Detail View). Items without an order go to the end, alphabetically.
        const withOrder = materialsInCategory.map(name => ({ name, order: safeMaterials[name]?.order }));
        withOrder.sort((a, b) => {
            const aHas = typeof a.order === 'number';
            const bHas = typeof b.order === 'number';
            if (aHas && bHas) return a.order - b.order;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return a.name.localeCompare(b.name);
        });
        return withOrder.map(x => x.name);
    }, [materialsInCategory, safeMaterials]);

    // Enable drag-to-reorder materials within this category and persist to Firestore
    const {
        orderedItems: orderedMaterials,
        handleDragStart,
        handleDragEnd,
        handleDragCancel,
    } = useFirestoreDnd(orderedMaterialsInCategory, safeMaterials);

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

    const getStockStyle = (count) => {
        const MAX_VISUAL_STOCK = 10; // Represents a "full" bar
        const fillPercent = Math.min((count / MAX_VISUAL_STOCK) * 100, 100);

        const emptyColor = '#3f3f46'; // zinc-700
        let fillColor;
        let textColor = 'text-white';

        // Define our color stops
        const red = { r: 239, g: 68, b: 68 };     // red-500
        const yellow = { r: 250, g: 204, b: 21 }; // yellow-400
        const green = { r: 74, g: 222, b: 128 };  // green-400

        if (count === 0) {
            fillColor = emptyColor;
            textColor = 'text-zinc-400';
        } else if (count <= 5) {
            // Interpolate between red and yellow
            const ratio = count / 5;
            const r = Math.round(red.r + (yellow.r - red.r) * ratio);
            const g = Math.round(red.g + (yellow.g - red.g) * ratio);
            const b = Math.round(red.b + (yellow.b - red.b) * ratio);
            fillColor = `rgb(${r}, ${g}, ${b})`;
        } else if (count < 10) {
            // Interpolate between yellow and green
            const ratio = (count - 5) / 5;
            const r = Math.round(yellow.r + (green.r - yellow.r) * ratio);
            const g = Math.round(yellow.g + (green.g - yellow.g) * ratio);
            const b = Math.round(yellow.b + (green.b - yellow.b) * ratio);
            fillColor = `rgb(${r}, ${g}, ${b})`;
        } else {
            // Solid green for 10+
            fillColor = `rgb(${green.r}, ${green.g}, ${green.b})`;
        }


        return {
            style: {
                background: `linear-gradient(to top, ${fillColor} ${fillPercent}%, ${emptyColor} ${fillPercent}%)`,
            },
            textColor,
        };
    };


    const cardClasses = isMarkedForDeletion
        ? 'ring-2 ring-red-500 bg-red-900/20'
        : 'border border-zinc-700';

    const headerCursor = isEditMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing';

    // Enhanced shadow effect for when the item is being dragged
    const draggingClasses = isDragging || isSortableDragging ? 'shadow-2xl shadow-blue-500/20' : 'shadow-lg';

    return (
        <div ref={setNodeRef} style={style} {...attributes} className={`bg-zinc-800 rounded-2xl flex flex-col transition-all duration-300 ${cardClasses} ${draggingClasses}`}>
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
                    <GripVertical className="text-zinc-500" />
                </div>
            </div>
            <div className="overflow-x-auto px-6 pb-6">
                {materialsInCategory.length > 0 ? (
                    <DndContext
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                    >
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-700">
                                    <th className="p-2 font-semibold text-zinc-400">Material</th>
                                    {STANDARD_LENGTHS.map(len => (
                                        <th key={len} className="p-2 font-semibold text-center text-zinc-400 border-l border-zinc-700">{len}"x48"</th>
                                    ))}
                                </tr>
                            </thead>
                            <SortableContext items={orderedMaterials} strategy={verticalListSortingStrategy}>
                                <tbody>
                                    {orderedMaterials.map(matType => (
                                        <SortableMaterialRow
                                            key={matType}
                                            id={matType}
                                            isEditMode={isEditMode}
                                            matType={matType}
                                            onMaterialClick={onMaterialClick}
                                            inventorySummary={inventorySummary}
                                            incomingSummary={incomingSummary}
                                            editingCell={editingCell}
                                            setEditingCell={setEditingCell}
                                            editValue={editValue}
                                            setEditValue={setEditValue}
                                            handleEditSave={handleEditSave}
                                            getStockStyle={getStockStyle}
                                        />
                                    ))}
                                </tbody>
                            </SortableContext>
                        </table>
                    </DndContext>
                ) : (
                    <p className="text-center text-zinc-400 py-8">No materials in this category.</p>
                )}
            </div>
        </div>
    );
};

function SortableMaterialRow({ id, isEditMode, matType, onMaterialClick, inventorySummary, incomingSummary, editingCell, setEditingCell, editValue, setEditValue, handleEditSave, getStockStyle }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: isEditMode });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-zinc-700 last:border-b-0 hover:bg-zinc-700/50 transition-colors">
            <td className="p-2 font-medium text-zinc-300">
                <div className="flex items-center gap-2">
                    <span {...attributes} {...listeners} className={`text-zinc-500 ${isEditMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}>
                        <GripVertical size={16} />
                    </span>
                    <span onClick={() => onMaterialClick(matType)} className="cursor-pointer hover:text-blue-400">{matType}</span>
                </div>
            </td>
            {STANDARD_LENGTHS.map(len => {
                const isEditingCell = isEditMode && editingCell?.matType === matType && editingCell?.len === len;
                const stockCount = inventorySummary[matType]?.[len] || 0;
                const incomingCount = incomingSummary[matType]?.lengths[len] || 0;
                const { style: stockStyle, textColor } = getStockStyle(stockCount);

                return (
                    <td key={len} className="p-2 text-center border-l border-zinc-700">
                        {isEditingCell ? (
                            <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleEditSave}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingCell(null); }}
                                className="w-20 text-center bg-zinc-600 text-white rounded focus:ring-2 focus:ring-amber-400 outline-none"
                                autoFocus
                            />
                        ) : (
                            <div
                                onDoubleClick={() => { if (isEditMode) { setEditingCell({ matType, len }); setEditValue(stockCount); } }}
                                className={`flex items-center justify-center gap-2 ${isEditMode ? 'cursor-pointer' : ''}`}
                                title={`${stockCount} sheets on hand`}
                            >
                                <span className={`font-bold text-2xl ${textColor}`}>{stockCount}</span>
                                <div className="w-4 h-10 rounded-full border-2 border-zinc-600 overflow-hidden">
                                    <div className="h-full" style={stockStyle}></div>
                                </div>
                            </div>
                        )}
                        {incomingCount > 0 && (
                            <div className="text-xs text-yellow-400 mt-1" title={`${incomingCount} sheets incoming`}>
                                (+{incomingCount} incoming)
                            </div>
                        )}
                    </td>
                );
            })}
        </tr>
    );
}