const mongoose = require('mongoose');

// ==========================================================
// DeptValidOrders Model — Tracks which orderNos are in the latest uploaded file per department
// ==========================================================
// Each document = one department (general, knitting, dyeing, finishing, delivery, yd)
// Updated every time a new Excel file is uploaded for that department
// Used to filter orders in plan menus — only show orders from uploaded files

const deptValidOrdersSchema = new mongoose.Schema({
    dept: { type: String, required: true, unique: true, index: true },
    // 'general', 'knitting', 'dyeing', 'finishing', 'delivery', 'yd'
    validOrderNos: [String],  // All orderNos from the latest uploaded file
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeptValidOrders', deptValidOrdersSchema);
