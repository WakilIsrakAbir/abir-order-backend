const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// 1. Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Database Connected Successfully!"))
    .catch((err) => console.log("❌ MongoDB Connection Error: ", err.message));

// 2. Basic Test Route
app.get('/', (req, res) => {
    res.send('Backend Server is Running Perfectly!');
});

// 3. API Routes Connection (Smart Check)
try {
    // Auth Routes (Login/Register)
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    console.log("✅ Auth API Routes Connected!");

    // File Upload Routes (Notun add kora holo)
    const uploadRoutes = require('./routes/upload');
    app.use('/api/files', uploadRoutes);
    
    // Uploads folder ke open kora holo jate frontend theke file download kora jay
    app.use('/uploads', express.static('uploads'));
    console.log("✅ File Upload API Connected!");

} catch (error) {
    console.log("❌ Route connect korte somossa hoyeche!");
    console.error("Error details:", error.message);
}

// 4. Server Port Setup
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});