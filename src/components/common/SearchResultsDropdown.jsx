// src/components/common/SearchResultsDropdown.jsx

import React from 'react';
import { Command, Compass, HardHat, Tag, Layers } from 'lucide-react';

const TypeIcon = ({ type }) => {
    switch (type) {
        case 'command':
            return <Command className="w-4 h-4 mr-3 text-zinc-400" />;
        case 'view':
            return <Compass className="w-4 h-4 mr-3 text-zinc-400" />;
        case 'job':
            return <HardHat className="w-4 h-4 mr-3 text-zinc-400" />;
        case 'material':
            return <Tag className="w-4 h-4 mr-3 text-zinc-400" />;
        case 'category':
            return <Layers className="w-4 h-4 mr-3 text-zinc-400" />;
        default:
            return null;
    }
};

export const SearchResultsDropdown = ({ results, onSelect, activeIndex, setActiveIndex }) => {
    if (results.length === 0) {
        return null;
    }

    return (
        <div className="absolute top-full mt-2 w-full md:w-1/3 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            <ul className="divide-y divide-zinc-700">
                {results.map((result, index) => (
                    <li
                        key={`${result.item.type}-${result.item.name}-${result.refIndex}`}
                        onClick={() => onSelect(result)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`p-3 flex items-center cursor-pointer ${index === activeIndex ? 'bg-zinc-700' : 'hover:bg-zinc-700/50'
                            }`}
                    >
                        <TypeIcon type={result.item.type} />
                        <div>
                            <p className="font-semibold text-white">{result.item.name}</p>
                            {result.item.type === 'job' && result.item.customer && (
                                <p className="text-sm text-zinc-400">Customer: {result.item.customer}</p>
                            )}
                            {result.item.type === 'material' && result.item.category && (
                                <p className="text-sm text-zinc-400">Category: {result.item.category}</p>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};
