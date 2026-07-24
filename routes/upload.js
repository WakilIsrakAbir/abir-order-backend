const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const File = require('../models/File');
const OrderDate = require('../models/OrderDate');

// ১. Multer Setup - Disk Storage (memory bachanot jonno)
const fs = require('fs');
const os = require('os');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, os.tmpdir()); // Temporarily save to system temp directory
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// ২. GridFS Bucket - MongoDB-te file save korar jonno
let gfsBucket;
function getGridFSBucket() {
    if (!gfsBucket && mongoose.connection.readyState === 1) {
        gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });
    }
    return gfsBucket;
}

// Reset bucket on reconnection (jodi connection restart hoy)
mongoose.connection.on('connected', () => {
    gfsBucket = null; // Next call to getGridFSBucket() will create a fresh bucket
});

// ==========================================
// API 1: File Upload (GridFS - MongoDB-te save hobe!)
// ==========================================
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        const { uploadedBy, role, category } = req.body;
        const originalName = req.file.originalname;
        const savedName = req.file.filename;

        const bucket = getGridFSBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'Database not ready. Please try again.' });
        }

        // File stream disk theke GridFS-e pipe kori
        const uploadStream = bucket.openUploadStream(savedName, {
            contentType: req.file.mimetype,
            metadata: {
                originalName: originalName,
                uploadedBy: uploadedBy,
                category: category || 'General'
            }
        });

        // Disk theke file pore GridFS-e write kori
        const readStream = fs.createReadStream(req.file.path);

        await new Promise((resolve, reject) => {
            readStream.pipe(uploadStream)
                .on('finish', resolve)
                .on('error', reject);
        });

        // Temporary disk file delete kore dei memory/disk space bachanot jonno
        fs.unlinkSync(req.file.path);

        // File metadata amader File model-e save kori (age jerakam chilo)
        const newFile = new File({
            originalName: originalName,
            savedName: savedName,
            uploadedBy: uploadedBy,
            role: role,
            category: category || 'General',
            size: req.file.size
        });

        await newFile.save();
        console.log(`✅ File saved to GridFS: ${savedName}`);
        return res.status(200).json({ message: 'File Uploaded and History Saved!', file: newFile });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ message: 'Server Error during upload' });
    }
});

// ==========================================
// API 2: Get All Files (eita age jemon chilo temon-i)
// ==========================================
router.get('/all', async (req, res) => {
    try {
        const files = await File.find().sort({ createdAt: -1 }).lean();
        // Allow browser to cache for 30 seconds (avoids repeated calls during navigation)
        res.set('Cache-Control', 'private, max-age=30');
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// API 2.5: Download/Serve File from GridFS
// ==========================================
router.get('/download/:filename', async (req, res) => {
    try {
        const bucket = getGridFSBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'Database not ready' });
        }

        const filename = req.params.filename;

        // Check if file exists in GridFS
        const files = await mongoose.connection.db
            .collection('uploads.files')
            .find({ filename: filename })
            .toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'File not found in storage' });
        }

        // Set proper content type
        const file = files[0];
        res.set('Content-Type', file.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${file.metadata?.originalName || filename}"`);

        // Stream file from GridFS to response
        const downloadStream = bucket.openDownloadStreamByName(filename);

        downloadStream.on('error', (err) => {
            console.error('GridFS download error:', err);
            if (!res.headersSent) {
                res.status(404).json({ message: 'File not found' });
            }
        });

        downloadStream.pipe(res);

    } catch (error) {
        console.error("Download Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Server Error during download' });
        }
    }
});

// ==========================================
// SUPER API: Clear Entire Database & All GridFS Files (Total Wipe)
// ==========================================
router.delete('/clear-all-planning', async (req, res) => {
    try {
        // 1. OrderDate collection clear
        await OrderDate.deleteMany({});

        // 2. File metadata collection clear
        await File.deleteMany({});

        // 3. GridFS collections clear (uploads.files + uploads.chunks)
        const db = mongoose.connection.db;
        try {
            await db.collection('uploads.files').deleteMany({});
            await db.collection('uploads.chunks').deleteMany({});
            console.log('✅ GridFS files cleared');
        } catch (gridErr) {
            console.log('GridFS collections may not exist yet:', gridErr.message);
        }

        res.status(200).json({ message: 'Entire database and all files cleared successfully' });
    } catch (error) {
        console.error("Clear DB Error:", error);
        res.status(500).json({ message: 'Error: ' + error.message });
    }
});

// ==========================================
// API 3: Delete Single File (GridFS + metadata)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found in database' });
        }

        // GridFS theke file delete kori
        const bucket = getGridFSBucket();
        if (bucket) {
            try {
                const gridFSFiles = await mongoose.connection.db
                    .collection('uploads.files')
                    .find({ filename: fileRecord.savedName })
                    .toArray();

                for (const f of gridFSFiles) {
                    await bucket.delete(f._id);
                }
                console.log(`✅ Deleted from GridFS: ${fileRecord.savedName}`);
            } catch (gridErr) {
                console.log('GridFS delete warning:', gridErr.message);
            }
        }

        // File metadata delete
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
        const { orderNo, department, fabricItems, orderStatus, completedDate, actualData } = req.body;
        
        let updateObj = {};
        
        // Support for Plan Vs Actual Tracking
        if (actualData) {
            updateObj[department] = actualData;
        } else {
            updateObj[department] = fabricItems; 
        }
        
        if (orderStatus) updateObj[`${department}Status`] = orderStatus;
        if (completedDate !== undefined) updateObj[`${department}CompletedDate`] = completedDate;
        
        const updatedRecord = await OrderDate.findOneAndUpdate(
            { orderNo: orderNo }, 
            { $set: updateObj },
            { returnDocument: 'after', upsert: true } 
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
        // Support optional department filter for faster queries
        const dept = req.query.dept;
        let query = OrderDate.find();
        
        if (dept) {
            // Only return orderNo + the requested department data (projection)
            const projection = { orderNo: 1 };
            projection[dept] = 1;
            projection[`${dept}Status`] = 1;
            projection[`${dept}CompletedDate`] = 1;
            // Also include other depts for cross-reference (delivery needs knitting/dyeing)
            ['knitting', 'dyeing', 'finishing', 'delivery', 'yd'].forEach(d => {
                projection[d] = 1;
                projection[`${d}Status`] = 1;
                projection[`${d}CompletedDate`] = 1;
            });
            query = OrderDate.find({}, projection);
        }
        
        res.set('Cache-Control', 'private, max-age=15');
        
        const docs = await query.lean();
        res.status(200).json(docs);
    } catch (error) {
        console.error('Error fetching all-dates:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Server Error' });
        } else {
            res.end();
        }
    }
});
// Fetch specific dates based on an array of order numbers
router.post('/specific-dates', async (req, res) => {
    try {
        const { orderNos, dept } = req.body;
        if (!orderNos || !Array.isArray(orderNos) || orderNos.length === 0) {
            return res.status(200).json([]);
        }

        let projection = { orderNo: 1, orderData: 1 };
        
        if (dept) {
            projection[dept] = 1;
            projection[`${dept}Status`] = 1;
            projection[`${dept}CompletedDate`] = 1;
        } else {
            ['knitting', 'dyeing', 'finishing', 'delivery', 'yd'].forEach(d => {
                projection[d] = 1;
                projection[`${d}Status`] = 1;
                projection[`${d}CompletedDate`] = 1;
            });
        }

        const docs = await OrderDate.find({ orderNo: { $in: orderNos } }, projection).lean();
        res.status(200).json(docs);
    } catch (error) {
        console.error('Error fetching specific-dates:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Fetch dates for a specific department only (used by Actual Tracking)
router.get('/dept-dates/:dept', async (req, res) => {
    try {
        const dept = req.params.dept;
        const validDepts = ['knitting', 'dyeing', 'finishing', 'delivery', 'yd'];
        if (!validDepts.includes(dept)) {
            return res.status(400).json({ message: 'Invalid department' });
        }

        let projection = { orderNo: 1, orderData: 1 };
        projection[dept] = 1;
        projection[`${dept}Status`] = 1;
        projection[`${dept}CompletedDate`] = 1;

        // Fetch ALL documents but only the projected fields, which is fast.
        // Then filter in memory in Node.js instead of making MongoDB do a full collection scan 
        // with complex array checks on unindexed fields.
        const allDocs = await OrderDate.find({}, projection).lean();
        const filteredDocs = allDocs.filter(doc => doc[dept] && Array.isArray(doc[dept]) && doc[dept].length > 0);
        
        res.status(200).json(filteredDocs);
    } catch (error) {
        console.error('Error fetching dept-dates:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;