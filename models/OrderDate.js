const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] },
    // 🟢 NEW: Status and Date
    orderStatus: { type: Object, default: {} },
    completedDate: { type: Object, default: {} }
}, { timestamps: true });
module.exports = mongoose.model('OrderDate', orderDateSchema);