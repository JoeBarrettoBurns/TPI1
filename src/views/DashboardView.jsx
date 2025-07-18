import React from 'react';
import { CATEGORIES } from '../constants/materials';
import { MaterialCategoryCard } from '../components/dashboard/MaterialCategoryCard';

export const DashboardView = ({ inventorySummary, incomingSummary, isEditMode, onSave, onMaterialClick }) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {CATEGORIES.map(category => (
            <MaterialCategoryCard
                key={category}
                category={category}
                inventorySummary={inventorySummary}
                incomingSummary={incomingSummary}
                isEditMode={isEditMode}
                onSave={onSave}
                onMaterialClick={onMaterialClick}
            />
        ))}
    </div>
);