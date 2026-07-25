const mongoose = require('mongoose');

// ==========================================================
// Order Model — Stores parsed Excel data for fast paginated queries
// ==========================================================
// Each document = one unique orderNo
// Contains: general info (from General file) + department items (from dept files)
// Updated on every file upload (replace strategy)

const orderSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true, index: true },
    
    // === General Info (from "General Information & Planning.xlsx") ===
    buyer: { type: String, default: '', index: true },
    bookingDate: { type: String, default: '' },
    requiredQtyKgs: { type: mongoose.Schema.Types.Mixed, default: '' },
    bookingBy: { type: String, default: '' },
    pmc: { type: String, default: '' },
    finalConfirmation: { type: String, default: '' },
    eventDay: { type: mongoose.Schema.Types.Mixed, default: '' },
    ship1: { type: String, default: '' },
    shipLast: { type: String, default: '' },
    yarnDate: { type: String, default: '' },
    knitStart: { type: String, default: '' },
    knitEnd: { type: String, default: '' },
    dyeStart: { type: String, default: '' },
    dyeEnd: { type: String, default: '' },
    deliStart: { type: String, default: '' },
    deliEnd: { type: String, default: '' },
    fabricNotes: { type: String, default: '' },
    status: { type: String, default: '' },
    
    // === Department Items (from dept-specific Excel files) ===
    // Each dept has an array of fabric/item rows from Excel
    knittingItems: { type: Array, default: [] },
    dyeingItems: { type: Array, default: [] },
    finishingItems: { type: Array, default: [] },
    deliveryItems: { type: Array, default: [] },
    ydItems: { type: Array, default: [] },

    // === Plan Status per department (computed from OrderDate saved plans) ===
    // 'Pending' | 'Confirm' | 'Tentative' | 'Completed'
    knittingPlanStatus: { type: String, default: 'Pending', index: true },
    dyeingPlanStatus: { type: String, default: 'Pending', index: true },
    finishingPlanStatus: { type: String, default: 'Pending', index: true },
    deliveryPlanStatus: { type: String, default: 'Pending', index: true },
    ydPlanStatus: { type: String, default: 'Pending', index: true },

}, { timestamps: true, strict: false });

// Compound indexes for common query patterns
orderSchema.index({ buyer: 1, knittingPlanStatus: 1 });
orderSchema.index({ buyer: 1, dyeingPlanStatus: 1 });
orderSchema.index({ buyer: 1, finishingPlanStatus: 1 });
orderSchema.index({ buyer: 1, deliveryPlanStatus: 1 });
orderSchema.index({ buyer: 1, ydPlanStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
