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
// API 1: File Upload & Overwrite
// ==========================================
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        const { uploadedBy, role } = req.body;
        const originalName = req.file.originalname; 
        const savedName = req.file.filename;        

        const existingFile = await File.findOne({ originalName: originalName });

        if (existingFile) {
            const oldFilePath = path.join(__dirname, '../uploads', existingFile.savedName);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath); 
            }

            existingFile.savedName = savedName;
            existingFile.uploadedBy = uploadedBy;
            existingFile.role = role;
            existingFile.createdAt = Date.now(); 
            
            await existingFile.save();

            return res.status(200).json({ message: 'File Overwritten Successfully!', file: existingFile });
        } else {
            const newFile = new File({
                originalName: originalName,
                savedName: savedName,
                uploadedBy: uploadedBy,
                role: role
            });
            
            await newFile.save();
            return res.status(200).json({ message: 'New File Uploaded Successfully!', file: newFile });
        }
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
// API 4: Save Process Dates & Fabric Planning (Fixed)
// ==========================================
router.post('/save-dates', async (req, res) => {
    try {
        // ফ্রন্টএন্ড থেকে পাঠানো সবগুলো ডেটা রিসিভ করা হলো
        const { 
            orderNo, eventDay, ship1, shipLast, yarnDate, deliStart, deliEnd, 
            knitStart, knitEnd, dyeStart, dyeEnd, cuttingDate, knittingDate, deliveryDate,
            fabricNotes, fabricItems 
        } = req.body;
        
        // Mongoose এর findOneAndUpdate মেথড দিয়ে একবারে সেভ/আপডেট করা হলো
        const updatedRecord = await OrderDate.findOneAndUpdate(
            { orderNo: orderNo }, // যেটা দিয়ে ডাটাবেসে খুঁজবে
            { 
                eventDay, ship1, shipLast, yarnDate, deliStart, deliEnd, 
                knitStart, knitEnd, dyeStart, dyeEnd, cuttingDate, knittingDate, deliveryDate,
                fabricNotes, fabricItems // নতুন ফিল্ডগুলোও এখানে পাঠিয়ে দিলাম
            },
            { new: true, upsert: true } // upsert: true মানে হলো আগে থেকে না থাকলে নতুন করে বানাবে
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