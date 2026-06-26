import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { Button } from '../common/Button';

function openMailto(mailto: any) {
    const link = document.createElement('a');
    link.href = mailto;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export const BuyOrderDraftsModal = ({ onClose, drafts = [] }: any) => {
    const [remainingDrafts, setRemainingDrafts] = useState(() => drafts.filter((draft: any) => draft?.mailto));

    const handleOpenDraft = (draftToOpen: any) => {
        openMailto(draftToOpen.mailto);
        setRemainingDrafts((currentDrafts: any) => currentDrafts.filter((draft: any) => draft !== draftToOpen));
    };

    return (
        <BaseModal onClose={onClose} title="Open Supplier Emails" maxWidthClass="max-w-3xl">
            <div className="space-y-4">
                <p className="text-sm text-zinc-300">
                    This order goes to multiple suppliers. Click each supplier below to open its draft email.
                </p>
                {remainingDrafts.length === 0 ? (
                    <p className="text-zinc-400">All supplier drafts have been opened.</p>
                ) : (
                    <div className="space-y-3">
                        {remainingDrafts.map((draft: any, index: any) => (
                            <div key={`${draft.supplier || 'supplier'}-${index}`} className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-lg font-bold text-blue-400">{draft.supplier || 'Supplier'}</p>
                                        <p className="truncate text-sm text-zinc-400">{draft.info?.email || 'No email configured'}</p>
                                        <p className="truncate text-xs text-zinc-500">{draft.subject || 'No subject'}</p>
                                    </div>
                                    <Button type="button" variant="primary" onClick={() => handleOpenDraft(draft)}>
                                        <Mail size={16} />
                                        <span>Open Email</span>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </BaseModal>
    );
};
