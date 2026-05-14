const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] },
    // Status and Date
    deptOrderStatus: { type: mongoose.Schema.Types.Mixed, default: {} },
    deptCompletedDate: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
module.exports = mongoose.model('OrderDate', orderDateSchema);