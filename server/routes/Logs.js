const express = require('express');
const router = express.Router();
const UsageLog = require('../models/UsageLog');
const InventoryItem = require('../models/InventoryItem');

// @route   GET api/logs
// @desc    Get all usage logs
router.get('/', async (req, res) => {
    try {
        const logs = await UsageLog.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   POST api/logs/use
// @desc    Use stock: deletes from inventory and creates a new usage log
router.post('/use', async (req, res) => {
    const { jobs } = req.body;
    try {
        for (const job of jobs) {
            const usedItemsForLog = [];
            for (const item of job.items) {
                for (const len of [96, 120, 144]) {
                    const qty = parseInt(item[`qty${len}`] || 0);
                    if (qty <= 0) continue;

                    const matchingSheets = await InventoryItem.find({
                        materialType: item.materialType,
                        length: len,
                        status: 'On Hand'
                    }).sort({ createdAt: 1 }).limit(qty);

                    if (matchingSheets.length < qty) {
                        // Important: Return a 400 Bad Request status for client-side errors
                        return res.status(400).json({ message: `Not enough stock for ${qty}x ${item.materialType} @ ${len}". Only ${matchingSheets.length} available.` });
                    }

                    const idsToDelete = matchingSheets.map(sheet => sheet._id);
                    await InventoryItem.deleteMany({ _id: { $in: idsToDelete } });

                    matchingSheets.forEach(sheet => {
                        const { _id, __v, ...rest } = sheet.toObject();
                        usedItemsForLog.push({ ...rest, qty: 1, originalId: _id });
                    });
                }
            }

            if (usedItemsForLog.length > 0) {
                const newLog = new UsageLog({
                    job: job.jobName || '',
                    customer: job.customer,
                    details: usedItemsForLog,
                    qty: -usedItemsForLog.length
                });
                await newLog.save();
            }
        }
        res.status(201).json({ message: 'Stock usage logged successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'An unexpected server error occurred.', error: err.message });
    }
});

// @route   DELETE api/logs/:id
// @desc    Delete a single log entry by its ID
router.delete('/:id', async (req, res) => {
    try {
        const log = await UsageLog.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ message: 'Log entry not found' });
        }
        await log.remove();
        res.json({ message: 'Log entry deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete log entry', error: err.message });
    }
});

module.exports = router;
