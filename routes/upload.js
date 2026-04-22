const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const File = require('../models/File'); // আপনার ডাটাবেস মডেল

// ১. Multer Setup (ফাইল কোথায় এবং কী নামে সেভ হবে)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/';
        // ফোল্ডার না থাকলে তৈরি করে নিবে
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // একই নামের ফাইলে যেন সমস্যা না হয়, তাই নামের আগে সময় যুক্ত করে দিলাম
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });


// ==========================================
// API 1: File Upload & Overwrite (Plan B)
// ==========================================
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        const { uploadedBy, role } = req.body;
        const originalName = req.file.originalname; // যেমন: Data.xlsx
        const savedName = req.file.filename;        // যেমন: 161234567-Data.xlsx

        // চেক করছি এই নামের কোনো ফাইল আগে থেকে ডাটাবেসে আছে কিনা
        const existingFile = await File.findOne({ originalName: originalName });

        if (existingFile) {
            // Plan B: ফাইল ওভাররাইট লজিক
            
            // ক. আগে সার্ভারের ফোল্ডার থেকে পুরনো ফাইলটি ডিলিট করবো
            const oldFilePath = path.join(__dirname, '../uploads', existingFile.savedName);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath); 
            }

            // খ. ডাটাবেসে পুরনো ফাইলের জায়গায় নতুন ফাইলের ডেটা আপডেট করে দিবো
            existingFile.savedName = savedName;
            existingFile.uploadedBy = uploadedBy;
            existingFile.role = role;
            existingFile.createdAt = Date.now(); // নতুন আপলোডের সময়
            
            await existingFile.save();

            return res.status(200).json({ message: 'File Overwritten Successfully!', file: existingFile });
        } else {
            // যদি আগে থেকে না থাকে, তবে নতুন করে সেভ করবো
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
        // একদম নতুন আপলোড হওয়া ফাইলগুলো উপরে দেখানোর জন্য sort করছি
        const files = await File.find().sort({ createdAt: -1 });
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});


// ==========================================
// API 3: Delete File (New Feature)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        
        // প্রথমে ডাটাবেস থেকে ফাইলটি খুঁজে বের করছি
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found in database' });
        }

        // ক. সার্ভারের uploads ফোল্ডার থেকে ফাইলটি ফিজিক্যালি ডিলিট করছি
        const filePath = path.join(__dirname, '../uploads', fileRecord.savedName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // খ. ডাটাবেস থেকে ফাইলের রেকর্ড মুছে দিচ্ছি
        await File.findByIdAndDelete(fileId);

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: 'Server Error during deletion' });
    }
});

module.exports = router;