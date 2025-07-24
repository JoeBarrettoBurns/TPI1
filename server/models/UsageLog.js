const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UsageLogSchema = new Schema({
    job: { type: String, default: '' },
    customer: { type: String, required: true },
    usedAt: { type: String, default: () => new Date().toISOString() },
    createdAt: { type: String, default: () => new Date().toISOString() },
    details: { type: Array, required: true },
    qty: { type: Number, required: true },
});

// The 'toJSON' transform is used to rename '_id' to 'id' for frontend compatibility.
UsageLogSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

module.exports = mongoose.model('UsageLog', UsageLogSchema);