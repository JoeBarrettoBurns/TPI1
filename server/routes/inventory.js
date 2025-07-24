const express = require('express');
const router = express.Router();
const InventoryItem = require('../models/InventoryItem');

// A simple helper function to get gauge from material type string.
// In a larger app, this might live in a shared utility file.
const getGaugeFromMaterial = (materialType) => {
    const match = materialType.match(/^(\d{2}GA)/);
    if (match) return match[1].replace('GA', '');
    const thicknessMatch = materialType.match(/(\d\.\d+)/);
    if (thicknessMatch) return thicknessMatch[1] + '"';
    return 'N/A';
};

// @route   GET api/inventory
// @desc    Get all inventory items
router.get('/', async (req, res) => {
    try {
        const items = await InventoryItem.find().sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   POST api/inventory/group
// @desc    Add a new order (a group of inventory items)
router.post('/group', async (req, res) => {
    const { jobs } = req.body;
    try {
        const newItems = [];
        jobs.forEach(job => {
            const jobName = job.jobName.trim() || null;
            job.items.forEach(item => {
                const arrivalDateString = job.arrivalDate;
                const localDate = arrivalDateString ? new Date(`${arrivalDateString}T00:00:00`) : null;

                const stockData = {
                    materialType: item.materialType,
                    gauge: getGaugeFromMaterial(item.materialType),
                    supplier: job.supplier,
                    costPerPound: parseFloat(item.costPerPound || 0),
                    job: jobName,
                    status: job.status,
                    arrivalDate: job.status === 'Ordered' && localDate ? localDate.toISOString() : null,
                };

                [96, 120, 144].forEach(len => {
                    const qty = parseInt(item[`qty${len}`] || 0);
                    for (let i = 0; i < qty; i++) {
                        newItems.push({ ...stockData, width: 48, length: len });
                    }
                });
            });
        });

        if (newItems.length > 0) {
            await InventoryItem.insertMany(newItems);
        }
        res.status(201).json({ message: 'Order created successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create order', error: err.message });
    }
});

// @route   DELETE api/inventory/group
// @desc    Delete a group of inventory items by their IDs
router.delete('/group', async (req, res) => {
    const { itemIds } = req.body;
    try {
        await InventoryItem.deleteMany({ _id: { $in: itemIds } });
        res.json({ message: 'Inventory group deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete inventory group', error: err.message });
    }
});

// @route   POST api/inventory/receive
// @desc    Mark a group of ordered items as "On Hand"
router.post('/receive', async (req, res) => {
    const { itemIds } = req.body;
    try {
        await InventoryItem.updateMany(
            { _id: { $in: itemIds } },
            { $set: { status: 'On Hand', dateReceived: new Date().toISOString().split('T')[0] } }
        );
        res.json({ message: 'Order received successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to receive order', error: err.message });
    }
});

module.exports = router;

