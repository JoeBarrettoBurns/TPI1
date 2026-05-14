import React from 'react';

const Tab = ({ label, view, activeView, setActiveView }) => {
    const isActive = activeView === view;
    const classes = isActive
        ? 'bg-blue-800 text-white'
        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white';

    return (
        <button
            type="button"
            onClick={() => setActiveView(view)}
            className={`shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-md text-sm md:text-base font-semibold transition-colors duration-200 ${classes}`}
        >
            {label}
        </button>
    );
};

export const ViewTabs = ({ activeView, setActiveView, categories }) => {
    const mainViews = [
        { label: 'Dashboard', view: 'dashboard' },
        { label: 'Jobs', view: 'jobs' },
        { label: 'Logs', view: 'logs' },
        { label: 'Price History', view: 'price-history' },
        { label: 'Sheet Calculator', view: 'sheet-calculator' },
        { label: 'Reorder', view: 'reorder' }
    ];

    const categoryViews = categories || [];

    return (
        <div className="mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-zinc-700 pb-4">
                <span className="text-zinc-400 font-semibold mr-2">Views:</span>
                {mainViews.map(v =>
                    <Tab key={v.view} {...v} activeView={activeView} setActiveView={setActiveView} />
                )}
            </div>

            <div className="flex items-center gap-2 min-w-0">
                <span className="text-zinc-400 font-semibold mr-2 shrink-0">Categories:</span>
                <div className="relative min-w-0 flex-1">
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 scroll-smooth [scrollbar-width:thin] [-ms-overflow-style:auto]">
                        {categoryViews.map(cat =>
                            <Tab key={cat} label={cat} view={cat} activeView={activeView} setActiveView={setActiveView} />
                        )}
                    </div>
                    <div
                        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-zinc-900 to-transparent"
                        aria-hidden
                    />
                </div>
            </div>
        </div>
    );
};
