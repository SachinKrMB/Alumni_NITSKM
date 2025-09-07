require('dotenv').config();
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Post = require('../models/post');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const OtpVerification = require('../models/OtpVerification');
const { sendOtpEmail } = require('../lib/mailer'); // may throw if not configured
const crypto = require('crypto');

let Alumni;
try {
  Alumni = require('../models/Alumni');
} catch (e) {
  console.warn("Alumni model not found.");
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const uid = req?.userId ?? 'anon';
    cb(null, `${Date.now()}-${uid}${ext}`);
  }
});
const fileFilter = (req, file, cb) => {
  if (!file || !file.mimetype) return cb(new Error('Invalid file'), false);
  if (file.mimetype.startsWith('image/')) return cb(null, true);
  return cb(new Error('Only image files allowed'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const isEmail = (v) => typeof v === 'string' && v.includes('@') && v.length < 320;
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Auth middleware (JWT)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.body.token || req.query.token;
  if (!authHeader) return res.status(401).json({ error: 'Authorization required' });

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
 * POST /api/auth/send-otp
 * - Generates OTP, stores it, tries to send email.
 * - If email send fails and NODE_ENV !== 'production', returns otp in response for dev testing.
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email' });

    const emailNorm = String(email).trim().toLowerCase();
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expireMinutes = Number(process.env.OTP_EXPIRE_MIN || 5);
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);

    // Keep only the latest OTP for this email
    await OtpVerification.deleteMany({ email: emailNorm });

    const doc = new OtpVerification({ email: emailNorm, otp, expiresAt });
    await doc.save();

    // Attempt to send email; if it fails, log error and return developer-friendly response when not in production
    try {
      await sendOtpEmail(emailNorm, otp, { expireMinutes });
      return res.json({ ok: true, message: 'OTP sent if email reachable' });
    } catch (e) {
      console.error('Failed sending OTP email:', e && (e.stack || e.message || e));
      if (process.env.NODE_ENV === 'production') {
        // don't reveal OTP in production
        return res.json({ ok: true, message: 'OTP sent if email reachable' });
      } else {
        // dev fallback - return OTP so you can test flows without SMTP
        return res.json({ ok: true, message: 'OTP not delivered via email (dev fallback)', otp });
      }
    }
  } catch (err) {
    console.error('send-otp error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// --- REGISTER ---
router.post('/register', async (req, res) => {
  const { username, email, password, userType } = req.body || {};
  try {
    if (!isNonEmptyString(username) || !isEmail(email) || !isNonEmptyString(password) || !isNonEmptyString(userType)) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }
    if (!['student', 'alumni'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid userType' });
    }

    const emailNorm = String(email).trim().toLowerCase();

    const existing = await User.findOne({ email: emailNorm });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const user = new User({ username: username.trim(), email: emailNorm, password, userType });
    await user.save();

    // If you are using express-session, req.session may exist; set it if available.
    try {
      if (req.session) {
        req.session.user = {
          name: user.username,
          photoURL: user.profilePic || ""
        };
      }
    } catch (e) {
      // ignore if session not present
      console.warn('Could not set session in register:', e && e.message);
    }

    const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

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
    res.status(500).json({ error: 'Registration failed' });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    if (!isEmail(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: emailNorm });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Save in session (if express-session is used)
    try {
      if (req.session) {
        req.session.user = {
          name: user.username,
          photoURL: user.profilePic || ""
        };
      }
    } catch (e) {
      console.warn('Could not set session in login:', e && e.message);
    }

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
      redirectTo: user.onboarded ? '/' : '/onboarding'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- VERIFY OTP ---
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, username, password, userType } = req.body || {};
    if (!isEmail(email) || !otp) return res.status(400).json({ error: 'Missing email or otp' });

    const emailNorm = String(email).trim().toLowerCase();

    const entry = await OtpVerification.findOne({ email: emailNorm }).sort({ createdAt: -1 });
    if (!entry) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    if (entry.expiresAt < new Date()) {
      await OtpVerification.deleteOne({ _id: entry._id });
      return res.status(400).json({ error: 'OTP expired' });
    }

    // limit attempts
    entry.attempts = (entry.attempts || 0) + 1;
    await entry.save();
    const MAX_ATTEMPTS = 5;
    if (entry.attempts > MAX_ATTEMPTS) {
      await OtpVerification.deleteOne({ _id: entry._id });
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const isMatch = (entry.otp === String(otp).trim());
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // OTP verified
    await OtpVerification.deleteOne({ _id: entry._id });

    if (!username || !password || !userType) {
      return res.json({ ok: true, message: 'OTP verified. Submit full registration payload to create account.' });
    }

    if (!isNonEmptyString(username) || !isNonEmptyString(password) || !isNonEmptyString(userType)) {
      return res.status(400).json({ error: 'Missing registration fields' });
    }
    if (!['student', 'alumni'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid userType' });
    }

    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({ username: username.trim(), email: emailNorm, password, userType });
    await user.save();

    // Save in session
    try {
      if (req.session) {
        req.session.user = {
          name: user.username,
          photoURL: user.profilePic || ""
        };
      }
    } catch (e) {
      console.warn('Could not set session in verify-otp:', e && e.message);
    }

    const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'User created',
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
    console.error('verify-otp error', err);
    return res.status(500).json({ error: 'OTP verification failed' });
  }
});

/**
 * POST /api/auth/onboarding
 * - Requires JWT auth (we accept token in body/query/header)
 * - Accepts profilePic (multipart/form-data) and updates user profile
 * - Updates req.session.user immediately if available
 */
router.post('/onboarding',
  // optional: keep authMiddleware if you expect a token, otherwise you can rely on session
  authMiddleware,
  (req, res, next) => {
    upload.single('profilePic')(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (req.file) {
        user.profilePic = `/uploads/${req.file.filename}`;
      }

      // If alumni -> collect extra fields, else student -> other fields
      if (user.userType === 'alumni') {
        const { currentCompany, currentPosition, about } = req.body;
        if (currentCompany) user.currentCompany = String(currentCompany).trim();
        if (currentPosition) user.currentPosition = String(currentPosition).trim();
        if (about) user.about = String(about).trim();
      } else if (user.userType === 'student') {
        const { batch, department } = req.body;
        if (batch) user.batch = String(batch).trim();
        if (department) user.department = String(department).trim();
      }

      user.onboarded = true;
      await user.save();

      // Update session user so avatar updates immediately
      try {
        if (req.session) {
          req.session.user = {
            name: user.username,
            photoURL: user.profilePic || ""
          };
        }
      } catch (e) {
        console.warn('Could not update session after onboarding:', e && e.message);
      }

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
        redirectTo: '/'
      });
    } catch (err) {
      console.error('Onboarding error:', err && (err.stack || err.message || err));
      res.status(500).json({ error: 'Onboarding failed' });
    }
  }
);

/**
 * POST /api/auth/update
 * - Update profile details + optional avatar upload
 * - Updates session user after saving
 */
router.post('/update',
  authMiddleware,
  (req, res, next) => {
    upload.single('avatar')(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { name, role, batch, location, bio } = req.body;
      if (name) user.username = name.trim();
      if (role) user.currentPosition = role.trim();
      if (batch) user.batch = batch.trim();
      if (location) user.location = location.trim();
      if (bio) user.about = bio.trim();

      if (req.file) {
        user.profilePic = `/uploads/${req.file.filename}`;
      }

      await user.save();

      // Update session
      try {
        if (req.session) {
          req.session.user = {
            name: user.username,
            photoURL: user.profilePic || ""
          };
        }
      } catch (e) {
        console.warn('Could not update session after profile update:', e && e.message);
      }

      res.json({
        message: 'Profile updated',
        profile: {
          id: user._id,
          name: user.username,
          role: user.currentPosition,
          batch: user.batch,
          location: user.location,
          bio: user.about,
          avatar: user.profilePic || '/img/default-avatar.png',
          email: user.email
        }
      });
    } catch (err) {
      console.error('Profile update error:', err && (err.stack || err.message || err));
      res.status(500).json({ error: 'Profile update failed' });
    }
  }
);

// --- LOGOUT ---
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.json({ message: 'Logged out' });
    });
  } else {
    res.json({ message: 'No session to destroy' });
  }
});

module.exports = {
  router,
  authMiddleware
};
