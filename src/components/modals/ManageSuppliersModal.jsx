import React, { useState } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { X, Save, Mail, RotateCcw } from 'lucide-react';
import { SUPPLIER_INFO as DEFAULT_SUPPLIER_INFO, CC_EMAIL } from '../../constants/suppliers';

export const ManageSuppliersModal = ({ onClose, suppliers, supplierInfo, onAddSupplier, onDeleteSupplier, onUpdateSupplierInfo }) => {
    const [newSupplier, setNewSupplier] = useState('');
    const [newInfo, setNewInfo] = useState({ email: '', subject: '', contactName: '', bodyMaterial: '', bodyTemplate: '', ccEmail: CC_EMAIL });
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [selected, setSelected] = useState(suppliers[0] || '');
    const [edits, setEdits] = useState(() => {
        const initial = {};
        suppliers.forEach(name => {
            const key = (name || '').toUpperCase().replace(/\s+/g, '_');
            const effective = supplierInfo?.[key] || DEFAULT_SUPPLIER_INFO[key] || DEFAULT_SUPPLIER_INFO.DEFAULT;
            initial[name] = { ...effective };
        });
        return initial;
    });

    // no-op

    const buildDefaultBodyTemplate = (material) => {
        const mat = (material || '').trim();
        if (!mat) return '';
        return (
            `${mat}\n` +
            `144"x48" -QTY:\n` +
            `120"x48" -QTY:\n` +
            `96"x48" -QTY:`
        );
    };

    const buildMailtoLink = (name) => {
        const data = edits[name] || {};
        const to = (data.email || '').trim();
        const subject = encodeURIComponent((data.subject || '').trim());
        const greeting = data.contactName ? `Hi ${data.contactName.trim()},` : 'Hello,';
        const bodyTemplate = (data.bodyTemplate && data.bodyTemplate.trim()) || buildDefaultBodyTemplate(data.bodyMaterial);
        const body = encodeURIComponent(`${greeting}\n\n${bodyTemplate}\n\nThank you.`);
        const cc = encodeURIComponent((data.ccEmail || CC_EMAIL || '').trim());
        return `mailto:${to}?cc=${cc}&subject=${subject}&body=${body}`;
    };

    const handleAdd = () => {
        setError('');
        const trimmedName = newSupplier.trim();
        const { email, subject, contactName, bodyMaterial, ccEmail } = newInfo;
        const allProvided = [trimmedName, email, subject, contactName, bodyMaterial].every(v => (v || '').trim() !== '');
        if (!allProvided) {
            setError('Please provide supplier name, email, subject, contact name, and default material.');
            return;
        }
        if (suppliers.includes(trimmedName)) {
            setError('A supplier with this name already exists.');
            return;
        }
        onAddSupplier(trimmedName, { email: email.trim(), subject: subject.trim(), contactName: contactName.trim(), bodyMaterial: bodyMaterial.trim(), ccEmail: (ccEmail || CC_EMAIL).trim(), ...(newInfo.bodyTemplate ? { bodyTemplate: newInfo.bodyTemplate.trim() } : {}) });
        setNewSupplier('');
        setNewInfo({ email: '', subject: '', contactName: '', bodyMaterial: '', bodyTemplate: '', ccEmail: CC_EMAIL });
    };

    const handleEditChange = (supplierName, field, value) => {
        setEdits(prev => ({
            ...prev,
            [supplierName]: {
                ...(prev[supplierName] || {}),
                [field]: value
            }
        }));
    };

    const handleSaveEdit = (supplierName) => {
        setError('');
        const data = edits[supplierName] || {};
        const { email, subject, contactName, bodyMaterial, bodyTemplate, ccEmail } = data;
        const allProvided = [email, subject, contactName, bodyMaterial].every(v => (v || '').trim() !== '');
        if (!allProvided) {
            setError(`All autofill fields are required for ${supplierName}.`);
            return;
        }
        onUpdateSupplierInfo(supplierName, {
            email: email.trim(),
            subject: subject.trim(),
            contactName: contactName.trim(),
            bodyMaterial: bodyMaterial.trim(),
            ccEmail: (ccEmail || CC_EMAIL).trim(),
            ...(bodyTemplate ? { bodyTemplate: bodyTemplate.trim() } : {})
        });
    };

    return (
        <BaseModal onClose={onClose} title="Manage Suppliers" maxWidthClass="max-w-6xl">
            <div className="space-y-4">
                {error && <ErrorMessage message={error} />}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-zinc-800/60 rounded-lg border border-zinc-700 p-3">
                            <h4 className="text-lg font-semibold text-white">Add Supplier</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                <FormInput name="newSupplier" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="New supplier name" label="Supplier Name" />
                                <FormInput name="newEmail" value={newInfo.email} onChange={(e) => setNewInfo({ ...newInfo, email: e.target.value })} placeholder="email@example.com" label="Email" />
                                <FormInput name="newSubject" value={newInfo.subject} onChange={(e) => setNewInfo({ ...newInfo, subject: e.target.value })} placeholder="Email subject" label="Subject" />
                                <FormInput name="newContactName" value={newInfo.contactName} onChange={(e) => setNewInfo({ ...newInfo, contactName: e.target.value })} placeholder="Contact name" label="Contact Name" />
                                <FormInput name="newBodyMaterial" value={newInfo.bodyMaterial} onChange={(e) => setNewInfo({ ...newInfo, bodyMaterial: e.target.value })} placeholder="Default material line" label="Default Material" />
                                    <FormInput name="newCc" value={newInfo.ccEmail} onChange={(e) => setNewInfo({ ...newInfo, ccEmail: e.target.value })} placeholder={CC_EMAIL} label="Cc" />
                                    <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-zinc-300">Email Body Template (optional)</label>
                                    <textarea className="w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={4} placeholder={buildDefaultBodyTemplate(newInfo.bodyMaterial)} value={newInfo.bodyTemplate} onChange={(e) => setNewInfo({ ...newInfo, bodyTemplate: e.target.value })} />
                                    <div className="mt-2 flex gap-2">
                                        <Button variant="secondary" onClick={() => setNewInfo({ ...newInfo, bodyTemplate: buildDefaultBodyTemplate(newInfo.bodyMaterial) })}><RotateCcw size={16} /><span>Use Default</span></Button>
                                        <Button onClick={handleAdd}><Save size={16} /><span>Add</span></Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg border border-zinc-700 p-3">
                            <h4 className="text-lg font-semibold text-white">Suppliers</h4>
                            <div className="mt-2">
                                <FormInput name="filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search suppliers..." />
                            </div>
                            <ul className="space-y-2 mt-2 max-h-[46vh] overflow-y-auto pr-1">
                                {suppliers.filter(s => s.toLowerCase().includes((filter || '').toLowerCase())).map(supplier => {
                                    const isSelected = selected === supplier;
                                    return (
                                        <li key={supplier} className={`flex items-center justify-between p-2 rounded cursor-pointer ${isSelected ? 'bg-blue-900/40 border border-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`} onClick={() => setSelected(supplier)}>
                                            <span className="truncate mr-2">{supplier}</span>
                                            <button onClick={(e) => { e.stopPropagation(); onDeleteSupplier(supplier); if (selected === supplier) setSelected(''); }} className="text-red-400 hover:text-red-300" title="Delete Supplier">
                                                <X size={18} />
                                            </button>
                                        </li>
                                    );
                                })}
                                {suppliers.length === 0 && (
                                    <li className="text-sm text-zinc-400">No suppliers yet.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <div className="bg-zinc-800/60 rounded-lg border border-zinc-700 p-4">
                            <h4 className="text-lg font-semibold text-white">Edit Supplier Details</h4>
                            {!selected ? (
                                <p className="text-zinc-400 mt-2">Select a supplier on the left to edit details.</p>
                            ) : (
                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <FormInput label="Email" name={`email_${selected}`} value={edits[selected]?.email || ''} onChange={(e) => handleEditChange(selected, 'email', e.target.value)} placeholder="email@example.com" />
                                    <FormInput label="Subject" name={`subject_${selected}`} value={edits[selected]?.subject || ''} onChange={(e) => handleEditChange(selected, 'subject', e.target.value)} placeholder="Email subject" />
                                    <FormInput label="Contact Name" name={`contact_${selected}`} value={edits[selected]?.contactName || ''} onChange={(e) => handleEditChange(selected, 'contactName', e.target.value)} placeholder="Contact name" />
                                    <FormInput label="Default Material" name={`mat_${selected}`} value={edits[selected]?.bodyMaterial || ''} onChange={(e) => handleEditChange(selected, 'bodyMaterial', e.target.value)} placeholder="Default material line for email body" />
                                    <FormInput label="Cc" name={`cc_${selected}`} value={edits[selected]?.ccEmail ?? CC_EMAIL} onChange={(e) => handleEditChange(selected, 'ccEmail', e.target.value)} placeholder={CC_EMAIL} />
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-zinc-300">Email Body Template</label>
                                        <textarea className="w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={8} value={(edits[selected]?.bodyTemplate ?? '') || buildDefaultBodyTemplate(edits[selected]?.bodyMaterial)} onChange={(e) => handleEditChange(selected, 'bodyTemplate', e.target.value)} />
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button variant="secondary" onClick={() => handleEditChange(selected, 'bodyTemplate', buildDefaultBodyTemplate(edits[selected]?.bodyMaterial))}><RotateCcw size={16} /><span>Reset Template</span></Button>
                                            <a href={buildMailtoLink(selected)} target="_blank" rel="noopener noreferrer">
                                                <Button variant="ghost"><Mail size={16} /><span>Open Email</span></Button>
                                            </a>
                                            <Button onClick={() => handleSaveEdit(selected)}><Save size={16} /><span>Save Changes</span></Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};