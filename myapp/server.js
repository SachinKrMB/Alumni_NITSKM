require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const { router: authRoutes } = require('./routes/auth');
const Post = require('./models/post');
const postsRouter = require('./routes/posts');
const profileRouter = require('./routes/profile');
const { getInitials, getAvatarStyle } = require("./lib/avatar");

const app = express();
const PORT = process.env.PORT || 5000;

// --- SESSION middleware (must be before routes) ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,  // set true if using https
      sameSite: "lax" // helps prevent CSRF issues
    }
  })
);

// --- CORS (allow cookies from frontend) ---
app.use(cors({
  origin: "http://localhost:5000", // change if frontend runs on another port/domain
  credentials: true
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static files
app.use(express.static(path.join(__dirname, 'public')));

// view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB URI log masking
const rawUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/alumni';
const safeUri = rawUri.replace(/:\/\/(.*?):(.*?)@/, '://<user>:<password>@');
console.log('Using MongoDB URI:', safeUri);

// Routes
app.use('/api/auth', authRoutes);
app.use('/posts', postsRouter);
app.use('/api/auth', profileRouter);

app.locals.getInitials = getInitials;
app.locals.getAvatarStyle = getAvatarStyle;

// --- NEW: API route to return logged-in user ---
app.get('/api/user', (req, res) => {
  if (req.session && req.session.user) {
    return res.json(req.session.user);
  }
  res.json({ name: "Guest", photoURL: "" });
});

// Static page routes
app.get('/onboarding', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'onboarding.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Home route
app.get('/', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(50).lean();
    const indexViewPath = path.join(__dirname, 'views', 'index.ejs');

    if (fs.existsSync(indexViewPath)) {
      return res.render('index', { user: req.session.user || null, posts });
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (err) {
    console.error('Home route error:', err);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Edit-post routes
app.get('/edit-post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('edit-post', { post });
  } catch (error) {
    console.error('Edit post error:', error);
    res.status(500).send('Server Error');
  }
});

app.post('/edit-post/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { title, content },
      { new: true }
    );
    if (!post) return res.status(404).send('Post not found');
    res.redirect(`/post/${req.params.id}`);
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).send('Server Error');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.disconnect();
  process.exit(0);
});

// Start DB + server
(async () => {
  try {
    await mongoose.connect(rawUri);
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();
