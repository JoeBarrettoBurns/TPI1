import React from 'react';
import { Mail } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';

export const BuyOrderDraftsModal = ({ onClose, drafts = [] }) => (
    <BaseModal onClose={onClose} title="Open Remaining Emails" maxWidthClass="max-w-3xl">
        <div className="space-y-4">
            <p className="text-sm text-zinc-300">
                Your first supplier email was opened automatically. The remaining drafts were blocked from opening automatically by the browser/runtime, so open them here one by one.
            </p>
            {drafts.length === 0 ? (
                <p className="text-zinc-400">No additional supplier drafts are waiting.</p>
            ) : (
                <div className="space-y-3">
                    {drafts.map((draft, index) => (
                        <div key={`${draft.supplier || 'supplier'}-${index}`} className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                    <p className="text-lg font-bold text-blue-400">{draft.supplier || 'Supplier'}</p>
                                    <p className="truncate text-sm text-zinc-400">{draft.info?.email || 'No email configured'}</p>
                                    <p className="truncate text-xs text-zinc-500">{draft.subject || 'No subject'}</p>
                                </div>
                                <a href={draft.mailto} target="_blank" rel="noopener noreferrer">
                                    <Button variant="primary">
                                        <Mail size={16} />
                                        <span>Open Email</span>
                                    </Button>
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </BaseModal>
);
