const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InventoryItemSchema = new Schema({
    materialType: { type: String, required: true },
    gauge: { type: String, required: true },
    supplier: { type: String, required: true },
    costPerPound: { type: Number, default: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() },
    job: { type: String, default: null },
    status: { type: String, enum: ['Ordered', 'On Hand'], required: true },
    arrivalDate: { type: String, default: null },
    dateReceived: { type: String, default: null },
    width: { type: Number, required: true },
    length: { type: Number, required: true },
});

// The 'toJSON' transform is used to rename '_id' to 'id' for frontend compatibility.
InventoryItemSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);