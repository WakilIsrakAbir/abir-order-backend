const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    originalName: {
        type: String,
        required: true
    },
    savedName: {
        type: String,
        required: true
    },
    uploadedBy: {
        type: String, // We will save the username here
        required: true
    },
    role: {
        type: String, // Admin or Planner
        required: true
    },
    size: {
        type: Number
    }
}, { timestamps: true }); // timestamps will automatically save the exact upload Date & Time

module.exports = mongoose.model('File', fileSchema);