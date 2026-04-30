// src/components/modals/ManageCategoriesModal.jsx
import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { FormInput } from '../common/FormInput';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { X, PlusCircle, Wrench, Trash2 } from 'lucide-react';
import { db, appId } from '../../firebase/config';
import { repairInventoryMaterialKeys } from '../../utils/backupService';
import { rebuildMissingMaterialsFromInventory } from '../../utils/recoveryService';
import { DEFAULT_CATEGORY_INDICATOR_SETTINGS, normalizeCategoryIndicatorSettings } from '../../utils/categoryIndicatorSettings';
import { DeleteCategoryModal } from './DeleteCategoryModal';

function createEmptyMaterialRow() {
	return {
		name: '',
		thickness: '',
		density: '',
		low: String(DEFAULT_CATEGORY_INDICATOR_SETTINGS.low),
		high: String(DEFAULT_CATEGORY_INDICATOR_SETTINGS.high),
		isNew: true,
	};
}

export const ManageCategoriesModal = ({ onClose, onSave, onDeleteCategory, categories, materials, refetchMaterials, materialIndicatorSettings }) => {
	const [mode, setMode] = useState('edit'); // 'edit' or 'add'
	const [selectedCategory, setSelectedCategory] = useState(categories[0] || '');
	const [newCategoryName, setNewCategoryName] = useState('');
	const [categoryMaterials, setCategoryMaterials] = useState([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [busyMsg, setBusyMsg] = useState('');
	const [categoryPendingDelete, setCategoryPendingDelete] = useState(null);
	const [deleteSubmitting, setDeleteSubmitting] = useState(false);
	const [deleteError, setDeleteError] = useState('');

	useEffect(() => {
		if (categories.length && !categories.includes(selectedCategory)) {
			setSelectedCategory(categories[0]);
		}
	}, [categories, selectedCategory]);

	useEffect(() => {
		if (mode !== 'edit') {
			setCategoryMaterials([createEmptyMaterialRow()]);
			return;
		}
		if (!selectedCategory || categories.length === 0) {
			setCategoryMaterials([]);
			return;
		}
		const materialsInCategory = Object.entries(materials)
			.filter(([, material]) => material.category === selectedCategory)
			.map(([id, material]) => {
				const settings = normalizeCategoryIndicatorSettings(materialIndicatorSettings?.[id] || material);
				return {
					...material,
					name: material.name || id,
					id,
					originalName: material.name || id,
					low: String(settings.low),
					high: String(settings.high),
					isNew: false,
				};
			});
		setCategoryMaterials(
			materialsInCategory.length > 0 ? materialsInCategory : [createEmptyMaterialRow()]
		);
	}, [selectedCategory, materials, mode, materialIndicatorSettings, categories.length]);

	const handleMaterialChange = (index, field, value) => {
		const newMaterials = [...categoryMaterials];
		newMaterials[index][field] = value;
		setCategoryMaterials(newMaterials);
	};

	const addMaterialRow = () => {
		setCategoryMaterials([...categoryMaterials, createEmptyMaterialRow()]);
	};

	const removeMaterialRow = (index) => {
		const newMaterials = categoryMaterials.filter((_, i) => i !== index);
		setCategoryMaterials(newMaterials);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		const finalCategoryName = mode === 'add' ? newCategoryName.trim() : selectedCategory;
		if (!finalCategoryName) {
			setError('Category name is required.');
			return;
		}
		if (mode === 'edit' && categoryMaterials.length === 0) {
			setIsSubmitting(true);
			setError('');
			try {
				await onSave(finalCategoryName, [], mode);
				if (refetchMaterials) await refetchMaterials();
				onClose();
			} catch (err) {
				setError(err.message || 'Failed to save changes.');
			} finally {
				setIsSubmitting(false);
			}
			return;
		}
		if (categoryMaterials.some(m => !m.name.trim() || !m.thickness || !m.density)) {
			setError('All fields for all materials are required.');
			return;
		}
		const hasInvalidIndicatorSettings = categoryMaterials.some((material) => {
			const parsedLow = Number(material.low);
			const parsedHigh = Number(material.high);
			return !Number.isFinite(parsedLow) || parsedLow < 0 || !Number.isFinite(parsedHigh) || parsedHigh <= parsedLow;
		});
		if (hasInvalidIndicatorSettings) {
			setError('Each material must have an indicator low of 0 or more, and a high greater than low.');
			return;
		}

		setIsSubmitting(true);
		setError('');

		try {
			await onSave(finalCategoryName, categoryMaterials, mode);
            if (refetchMaterials) {
                await refetchMaterials();
            }
			onClose();
		} catch (err) {
			setError(err.message || 'Failed to save changes.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const confirmDeleteCategory = async () => {
		if (!onDeleteCategory || !categoryPendingDelete) return;
		setDeleteError('');
		setDeleteSubmitting(true);
		try {
			await onDeleteCategory(categoryPendingDelete);
			setCategoryPendingDelete(null);
			onClose();
		} catch (err) {
			setDeleteError(err.message || 'Failed to delete category.');
		} finally {
			setDeleteSubmitting(false);
		}
	};

	return (
		<BaseModal onClose={onClose} title="Manage Categories and Materials">
			<div className="flex justify-between items-center mb-4 gap-2">
				<div className="flex items-center gap-2">
					<Button
						variant="secondary"
						onClick={async () => {
							try {
								setBusyMsg('Repairing material keys in inventory...');
								const materialsKeys = Object.keys(materials);
								const res = await repairInventoryMaterialKeys(db, appId, materialsKeys);
								setBusyMsg(`Repair complete. Updated ${res.updated} items.`);
							} catch (err) {
								setBusyMsg('');
								setError(err.message || 'Repair failed');
							} finally {
								setTimeout(() => setBusyMsg(''), 4000);
							}
						}}
						title="Repair Inventory Material Keys"
					>
						<Wrench size={16} /> Repair Keys
					</Button>
					<Button
						variant="secondary"
						onClick={async () => {
							try {
								setBusyMsg('Rebuilding missing materials from inventory references...');
								const keys = Object.keys(materials);
								const res = await rebuildMissingMaterialsFromInventory(db, appId, keys);
								setBusyMsg(`Rebuilt ${res.created} missing materials.`);
							} catch (err) {
								setBusyMsg('');
								setError(err.message || 'Rebuild failed');
							} finally {
								setTimeout(() => setBusyMsg(''), 4000);
							}
						}}
						title="Rebuild Materials From Inventory"
					>
						<Wrench size={16} /> Rebuild Materials
					</Button>
					{busyMsg && <span className="text-xs text-zinc-400">{busyMsg}</span>}
				</div>
				<Button onClick={() => setMode(m => m === 'edit' ? 'add' : 'edit')} variant="secondary">
					{mode === 'edit' ? 'Add New Category' : 'Edit Existing Category'}
				</Button>
			</div>
			<form onSubmit={handleSubmit} className="space-y-6">
				{mode === 'edit' ? (
					<div className="space-y-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
							<div className="flex-1 min-w-0">
								<label htmlFor="category-select" className="block text-sm font-medium text-zinc-300">Category</label>
								<select
									id="category-select"
									value={selectedCategory}
									onChange={(e) => setSelectedCategory(e.target.value)}
									className="w-full mt-1 p-2 bg-zinc-700 border border-zinc-600 text-white rounded-lg"
								>
									{categories.length === 0 ? (
										<option value="">No categories yet</option>
									) : (
										categories.map(cat => <option key={cat} value={cat}>{cat}</option>)
									)}
								</select>
							</div>
							{onDeleteCategory && selectedCategory && (
								<Button
									type="button"
									variant="danger"
									className="shrink-0"
									disabled={!selectedCategory || deleteSubmitting}
									onClick={() => {
										setDeleteError('');
										setCategoryPendingDelete(selectedCategory);
									}}
								>
									<Trash2 size={16} /> Delete category
								</Button>
							)}
						</div>
					</div>
				) : (
					<FormInput
						label="New Category Name"
						name="newCategoryName"
						value={newCategoryName}
						onChange={(e) => setNewCategoryName(e.target.value)}
						required
						placeholder="e.g., Cold Rolled Steel"
					/>
				)}

				<div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 border-t border-b border-slate-700 py-4">
					<h4 className="text-lg font-semibold text-white">Materials in {mode === 'edit' ? selectedCategory : newCategoryName || 'New Category'}</h4>
					{categoryMaterials.map((material, index) => (
						<div key={index} className="p-4 border border-slate-700 rounded-lg bg-slate-900/50 relative">
							<button
								type="button"
								onClick={() => removeMaterialRow(index)}
								className="absolute top-2 right-2 text-red-400 hover:text-red-300"
								title={categoryMaterials.length === 1 ? 'Remove material (save to apply, or delete category)' : 'Remove row'}
							>
								{categoryMaterials.length === 1 ? <Trash2 size={18} /> : <X size={18} />}
							</button>
							<div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4 items-start">
								<div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">High / Low</p>
									<div className="grid grid-cols-2 gap-2 mt-3">
										<FormInput label="Low" type="number" value={material.low} onChange={(e) => handleMaterialChange(index, 'low', e.target.value)} required min="0" step="1" />
										<FormInput label="High" type="number" value={material.high} onChange={(e) => handleMaterialChange(index, 'high', e.target.value)} required min="1" step="1" />
									</div>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<FormInput label="Material Name" value={material.name} onChange={(e) => handleMaterialChange(index, 'name', e.target.value)} required placeholder="e.g., 16GA-CRS" />
									<FormInput label="Thickness (in)" type="number" value={material.thickness} onChange={(e) => handleMaterialChange(index, 'thickness', e.target.value)} required step="0.001" />
									<FormInput label="Density (lbs/inł)" type="number" value={material.density} onChange={(e) => handleMaterialChange(index, 'density', e.target.value)} required step="0.0001" />
								</div>
							</div>
						</div>
					))}
					<Button variant="ghost" className="w-full mt-2 !border-dashed !border-slate-600 hover:!border-blue-500" onClick={addMaterialRow}>
						<PlusCircle size={16} /> Add Material
					</Button>
				</div>

				{error && <ErrorMessage message={error} />}

				<div className="flex justify-end pt-4">
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</Button>
				</div>
			</form>
			{categoryPendingDelete && (
				<DeleteCategoryModal
					onClose={() => { if (!deleteSubmitting) setCategoryPendingDelete(null); }}
					onConfirm={confirmDeleteCategory}
					categoryName={categoryPendingDelete}
					error={deleteError}
					isSubmitting={deleteSubmitting}
				/>
			)}
		</BaseModal>
	);
};
