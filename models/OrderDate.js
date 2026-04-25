const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    fabricItems: { type: Array, default: [] } // এখন ডাটাবেসে শুধু টেবিলের ডেটা সেভ হবে
});

module.exports = mongoose.model('OrderDate', orderDateSchema);