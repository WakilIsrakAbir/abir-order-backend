const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] },
    // 🟢 Status field add kora holo
    orderStatus: { type: String, default: 'Active' }
}, { timestamps: true }); // timestamps add kora holo jeno date onujayi sajano jay

module.exports = mongoose.model('OrderDate', orderDateSchema);