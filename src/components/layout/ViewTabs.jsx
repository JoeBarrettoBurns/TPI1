// src/components/layout/ViewTabs.jsx

import React from 'react';

const Tab = ({ label, view, activeView, setActiveView }) => {
    const isActive = activeView === view;
    const classes = isActive
        ? 'bg-blue-600 text-white'
        : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white';

    return (
        <button
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 rounded-md font-semibold transition-colors duration-200 ${classes}`}
        >
            {label}
        </button>
    );
};

export const ViewTabs = ({ activeView, setActiveView, categories }) => {
    const mainViews = [
        { label: 'Dashboard', view: 'dashboard' },
        { label: 'Logs', view: 'logs' },
        { label: 'Price History', view: 'price-history' },
        { label: 'Analytics', view: 'analytics' }
    ];

    // The category tabs are now always rendered
    const categoryViews = categories || [];

    return (
        <div className="mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-slate-700 pb-4">
                <span className="text-slate-400 font-semibold mr-2">Views:</span>
                {mainViews.map(v =>
                    <Tab key={v.view} {...v} activeView={activeView} setActiveView={setActiveView} />
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-semibold mr-2">Categories:</span>
                {categoryViews.map(cat =>
                    <Tab key={cat} label={cat} view={cat} activeView={activeView} setActiveView={setActiveView} />
                )}
            </div>
        </div>
    );
};