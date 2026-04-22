const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    cuttingDate: { type: String, default: "" },
    knittingDate: { type: String, default: "" },
    deliveryDate: { type: String, default: "" }
});

module.exports = mongoose.model('OrderDate', orderDateSchema);