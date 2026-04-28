const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const OrderDate = require('../models/OrderDate'); 

// ১. Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// ==========================================
// API 1: File Upload (Bulletproof Overwrite)
// ==========================================
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        const { uploadedBy, role, category } = req.body;
        const originalName = req.file.originalname; 
        const savedName = req.file.filename;        
        const targetCategory = category || 'General';

        // ডাটাবেস থেকে একই নামের এবং একই ক্যাটাগরির 'সবগুলো' ডুপ্লিকেট ফাইল খুঁজে বের করবে
        const existingFiles = await File.find({ originalName: originalName, category: targetCategory });

        // যদি কোনো ফাইল থাকে, তবে সার্ভার ফোল্ডার এবং ডাটাবেস থেকে সব ডিলিট করে দিবে (ক্লিনআপ)
        if (existingFiles.length > 0) {
            for (let file of existingFiles) {
                const oldFilePath = path.join(__dirname, '../uploads', file.savedName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath); 
                }
                await File.findByIdAndDelete(file._id);
            }
        }

        // ক্লিনআপ শেষে একদম ফ্রেশ করে নতুন ফাইলটা সেভ করবে
        const newFile = new File({
            originalName: originalName,
            savedName: savedName,
            uploadedBy: uploadedBy,
            role: role,
            category: targetCategory
        });
        
        await newFile.save();
        return res.status(200).json({ message: 'File Overwritten & Cleaned Successfully!', file: newFile });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ message: 'Server Error during upload' });
    }
});

// ==========================================
// API 2: Get All Files
// ==========================================
router.get('/all', async (req, res) => {
    try {
        const files = await File.find().sort({ createdAt: -1 });
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// API 3: Delete File
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found in database' });
        }

        const filePath = path.join(__dirname, '../uploads', fileRecord.savedName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await File.findByIdAndDelete(fileId);
        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: 'Server Error during deletion' });
    }
});

// ==========================================
// API 4: Save Process Dates & Fabric Planning (Department Wise)
// ==========================================
router.post('/save-dates', async (req, res) => {
    try {
        const { orderNo, department, fabricItems } = req.body;
        
        let updateObj = {};
        updateObj[department] = fabricItems; 
        
        const updatedRecord = await OrderDate.findOneAndUpdate(
            { orderNo: orderNo }, 
            { $set: updateObj },
            { new: true, upsert: true } 
        );
        
        res.status(200).json({ message: 'Planning Data saved successfully!', data: updatedRecord });
    } catch (error) {
        console.error("Save Dates Error:", error);
        res.status(500).json({ message: 'Server Error while saving data' });
    }
});

// ==========================================
// API 5: Get All Process Dates
// ==========================================
router.get('/all-dates', async (req, res) => {
    try {
        const dates = await OrderDate.find();
        res.status(200).json(dates);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;