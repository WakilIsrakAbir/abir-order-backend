const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    knitting: { type: Array, default: [] },
    dyeing: { type: Array, default: [] },
    finishing: { type: Array, default: [] },
    delivery: { type: Array, default: [] }
});

module.exports = mongoose.model('OrderDate', orderDateSchema);