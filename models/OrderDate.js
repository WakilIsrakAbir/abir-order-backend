const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] },
    // Status and Date
    deptOrderStatus: { type: Object, default: {} },
    deptCompletedDate: { type: Object, default: {} }
}, { timestamps: true });
module.exports = mongoose.model('OrderDate', orderDateSchema);