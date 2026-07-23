const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'Approver', 'Planner', 'Viewer'], 
        default: 'Viewer'
    },
    status: {
        type: String,
        default: 'active'
    },
    permissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    plainPassword: {
        type: String,
        required: false
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);