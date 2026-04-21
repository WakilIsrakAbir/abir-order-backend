const express = require('express');
const router = express.Router();
const multer = require('multer');
const File = require('../models/File');
const path = require('path');

// Multer Storage Engine Set kora (File kothay ar ki name save hobe)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // File gulo uploads folder e jabe
    },
    filename: function (req, file, cb) {
        // Ek e namer file asle jeno replace na hoye jay, tai namer age time add kore dilam
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// 1. UPLOAD FILE API
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Kono file upload kora hoyni!" });
        }

        // Frontend theke user er info nibe
        const { uploadedBy, role } = req.body;

        // Database e file er record save korbe
        const newFile = new File({
            originalName: req.file.originalname,
            savedName: req.file.filename,
            size: req.file.size,
            uploadedBy: uploadedBy || 'Unknown',
            role: role || 'Unknown'
        });

        await newFile.save();
        res.status(201).json({ message: "File successfully upload hoyeche!", file: newFile });

    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "File upload korte server e somossa hoyeche." });
    }
});

// 2. GET ALL FILES API (Dashboard e sob file dekhabar jonno)
router.get('/all', async (req, res) => {
    try {
        // Sob file khuje ber korbe ebong notun gulo age dekhabe (createdAt: -1)
        const files = await File.find().sort({ createdAt: -1 });
        res.status(200).json(files);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "File gulo load korte somossa hoyeche." });
    }
});

module.exports = router;