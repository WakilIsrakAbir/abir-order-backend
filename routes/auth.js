const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // Password encrypt korar jonno
const jwt = require('jsonwebtoken'); // Login token bananor jonno
const User = require('../models/User'); // Amader User model

// 1. REGISTER API (Notun User kholar jonno)
// Endpoint: POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;

        // Check korbo username age theke ache kina
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "এই ইউজারনেমটি আগে থেকেই আছে! অন্য একটি চেষ্টা করুন।" });
        }

        // Password Hash (Encrypt) kora
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Notun User toiri kora
        const newUser = new User({
            username,
            password: hashedPassword,
            role: role || 'Viewer' // Default role Viewer
        });

        // Database e save kora
        await newUser.save();
        res.status(201).json({ message: "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "সার্ভারে কোনো সমস্যা হয়েছে!" });
    }
});

// 2. LOGIN API (Login korar jonno)
// Endpoint: POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // User check kora
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: "এই নামে কোনো ইউজার পাওয়া যায়নি!" });
        }

        // Password check kora (Hash er sathe melano)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "পাসওয়ার্ড ভুল হয়েছে!" });
        }

        // Token toiri kora (Jeta frontend e pathabo)
        const payload = {
            userId: user._id,
            role: user.role
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' }); // 1 din por expire hobe

        // Login success hole info pathano
        res.status(200).json({
            message: "সফলভাবে লগইন হয়েছে!",
            token,
            user: {
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "সার্ভারে কোনো সমস্যা হয়েছে!" });
    }
});

// 3. GET ALL USERS API (To view the list of all users)
// Endpoint: GET /api/auth/users
router.get('/users', async (req, res) => {
    try {
        // Fetch all users from the database, but exclude their passwords for security
        const users = await User.find().select('-password'); 
        res.status(200).json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error occurred!" });
    }
});

// 4. DELETE USER API (To delete a specific user)
// Endpoint: DELETE /api/auth/user/:id
router.delete('/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        await User.findByIdAndDelete(userId);
        res.status(200).json({ message: "User deleted successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to delete user!" });
    }
});

module.exports = router;