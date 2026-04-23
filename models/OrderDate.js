const mongoose = require('mongoose');

const orderDateSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true },
    
    // T&A এবং Planning Dates
    eventDay: { type: String, default: "" },
    ship1: { type: String, default: "" },
    shipLast: { type: String, default: "" },
    yarnDate: { type: String, default: "" },
    deliStart: { type: String, default: "" },
    deliEnd: { type: String, default: "" },
    knitStart: { type: String, default: "" },
    knitEnd: { type: String, default: "" },
    dyeStart: { type: String, default: "" },
    dyeEnd: { type: String, default: "" },

    // Legacy Dates
    cuttingDate: { type: String, default: "" },
    knittingDate: { type: String, default: "" },
    deliveryDate: { type: String, default: "" },
    
    // Fabric Items & Notes
    fabricNotes: { type: String, default: '' },
    fabricItems: { type: Array, default: [] }
});

module.exports = mongoose.model('OrderDate', orderDateSchema);