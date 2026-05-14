const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] },
    // Status and Date
    knittingStatus: { type: String, default: 'On Process' },
    dyeingStatus: { type: String, default: 'On Process' },
    finishingStatus: { type: String, default: 'On Process' },
    deliveryStatus: { type: String, default: 'On Process' },
    
    knittingCompletedDate: { type: String, default: null },
    dyeingCompletedDate: { type: String, default: null },
    finishingCompletedDate: { type: String, default: null },
    deliveryCompletedDate: { type: String, default: null }
}, { timestamps: true });
module.exports = mongoose.model('OrderDate', orderDateSchema);