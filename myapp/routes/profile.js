/**
 * routes/profile.js
 * Minimal profile API:
 *  - GET /api/auth/me
 *  - POST /api/auth/update  (multipart: avatar + fields)
 *
 * Relies on:
 *  - models/User.js
 *  - routes/auth.js exporting authMiddleware
 *  - existing public/uploads directory (we create if missing)
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('../models/User'); // adjust if your model path differs
const { authMiddleware } = require('./auth'); // uses exported middleware from routes/auth.js

const router = express.Router();

// ensure uploads dir exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const uid = req.userId || 'anon';
    cb(null, `${Date.now()}-${uid}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 } // 6MB
});

// GET /api/auth/me  (protected)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // normalize for frontend (keep both shapes)
    res.json({
      user,
      profile: {
        id: user._id,
        username: user.username || user.name,
        name: user.username || user.name,
        email: user.email,
        profilePic: user.profilePic || user.profilePic || user.avatar || null,
        avatar: user.profilePic || user.avatar || null,
        currentPosition: user.currentPosition || user.role || '',
        role: user.currentPosition || user.role || '',
        about: user.about || '',
        bio: user.about || '',
        batch: user.batch || '',
        location: user.location || ''
      }
    });
  } catch (err) {
    console.error('GET /api/auth/me error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/update  (protected) - accepts 'avatar' file + fields
router.post('/update', authMiddleware, (req, res, next) => {
  upload.single('avatar')(req, res, function (err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // fields
    const { name, role, batch, location, bio } = req.body;
    if (name) user.username = String(name).trim();
    if (role) user.currentPosition = String(role).trim();
    if (batch) user.batch = String(batch).trim();
    if (location) user.location = String(location).trim();
    if (bio) user.about = String(bio).trim();

    if (req.file) {
      user.profilePic = `/uploads/${req.file.filename}`;
    }

    await user.save();

    res.json({
      message: 'Profile updated',
      profile: {
        id: user._id,
        name: user.username || user.name,
        username: user.username || user.name,
        email: user.email,
        avatar: user.profilePic || user.avatar || null,
        profilePic: user.profilePic || user.avatar || null,
        role: user.currentPosition || '',
        about: user.about || '',
        bio: user.about || '',
        batch: user.batch || '',
        location: user.location || ''
      }
    });
  } catch (err) {
    console.error('POST /api/auth/update error', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

module.exports = router;
