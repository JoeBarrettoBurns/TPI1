// src/components/common/AuditTag.jsx

import React from 'react';
import { UserRound, Pencil } from 'lucide-react';

/** Compact account label: local part of the email, full value in the tooltip. */
const shortAccountLabel = (value) => {
    const s = String(value || '').trim();
    if (!s) return '';
    const at = s.indexOf('@');
    return at > 0 ? s.slice(0, at) : s;
};

/**
 * Small audit badge for log rows: who created the entry and, when applicable,
 * who last edited it. Entries from before audit stamping render nothing.
 */
export const AuditTag = ({ createdBy, lastEditedBy }) => {
    if (!createdBy && !lastEditedBy) return null;

    return (
        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1">
            {createdBy && (
                <span
                    title={`Logged by ${createdBy}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-700/70 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                >
                    <UserRound size={10} className="shrink-0" />
                    <span className="truncate">{shortAccountLabel(createdBy)}</span>
                </span>
            )}
            {lastEditedBy && (
                <span
                    title={`Last edited by ${lastEditedBy}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200"
                >
                    <Pencil size={10} className="shrink-0" />
                    <span className="truncate">{shortAccountLabel(lastEditedBy)}</span>
                </span>
            )}
        </span>
    );
};
