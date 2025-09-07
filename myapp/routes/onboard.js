// routes/auth.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Post = require('../models/post');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_with_env_secret';

// Multer setup for profile image uploads
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${req.userId || 'anon'}${ext}`);
  }
});

// optional: file filter to accept only images and limit size
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif/;
  const ext = (file.mimetype || '').split('/')[1];
  if (allowed.test(ext)) cb(null, true);
  else cb(new Error('Only image files are allowed (jpeg, jpg, png, gif).'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Auth middleware to protect routes that need a valid token
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.body.token || req.query.token;
  if (!authHeader) return res.status(401).json({ error: 'Authorization required' });

  // Allow "Bearer <token>" or raw token
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    req.userType = payload.userType;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Registration
 * Accepts: { username, email, password, userType }
 * Returns: { token, user: {...}, redirectTo: '/onboarding' }
 */
router.post('/register', async (req, res) => {
  const { username, email, password, userType } = req.body;
  try {
    if (!username || !email || !password || !userType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['student', 'alumni'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    // Check existing email
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const user = new User({ username, email, password, userType });
    await user.save();

    const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    // client can redirect to onboarding after registration
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        onboarded: user.onboarded
      },
      redirectTo: '/onboarding'
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

/**
 * Login
 * Accepts: { email, password }
 * Returns: { token, user, redirectTo }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        onboarded: user.onboarded
      },
      redirectTo: user.onboarded ? '/dashboard' : '/onboarding'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

/**
 * Get current user
 * Protected
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * Onboarding submit
 * Protected
 * Accepts either alumni fields or student fields; optional profilePic file
 * alumni: { currentCompany, currentPosition, about }
 * student: { batch, department }
 *
 * Call with multipart/form-data when uploading file, otherwise application/json.
 */
router.post('/onboarding', authMiddleware, upload.single('profilePic'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Handle file
    if (req.file) {
      // store relative path usable by express.static('public')
      user.profilePic = `/uploads/${req.file.filename}`;
    }

    // Update by role
    if (user.userType === 'alumni') {
      const { currentCompany, currentPosition, about } = req.body;
      if (currentCompany) user.currentCompany = currentCompany;
      if (currentPosition) user.currentPosition = currentPosition;
      if (about) user.about = about;
    } else if (user.userType === 'student') {
      const { batch, department } = req.body;
      if (batch) user.batch = batch;
      if (department) user.department = department;
    }

    user.onboarded = true;
    await user.save();

    res.json({
      message: 'Onboarding completed',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        onboarded: user.onboarded,
        profilePic: user.profilePic,
        currentCompany: user.currentCompany,
        currentPosition: user.currentPosition,
        about: user.about,
        batch: user.batch,
        department: user.department
      },
      redirectTo: '/profile'
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: err.message || 'Onboarding failed' });
  }
});

/**
 * Optional: existing post edit routes (kept from your file)
 */

// Route to render the edit post form (if you need EJS render)
router.get('/edit-post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('edit-post', { post });
  } catch (err) {
    console.error('Edit post GET error:', err);
    res.status(500).send('Server Error');
  }
});

// Route to handle post update
router.post('/update-post/:id', async (req, res) => {
  try {
    const { title, author, content } = req.body;
    await Post.findByIdAndUpdate(req.params.id, { title, author, content });
    res.redirect('/some-redirect-url'); // change to the accurate URL
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
