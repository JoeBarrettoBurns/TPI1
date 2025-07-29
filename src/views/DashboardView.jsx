// src/views/DashboardView.jsx

import React from 'react';
import { MaterialCategoryCard } from '../components/dashboard/MaterialCategoryCard';

export const DashboardView = ({ inventorySummary, incomingSummary, isEditMode, onSave, onMaterialClick, materials, categories }) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {categories.map(category => (
            <MaterialCategoryCard
                key={category}
                category={category}
                inventorySummary={inventorySummary}
                incomingSummary={incomingSummary}
                isEditMode={isEditMode}
                onSave={onSave}
                onMaterialClick={onMaterialClick}
                materials={materials}
            />
        ))}
    </div>
);