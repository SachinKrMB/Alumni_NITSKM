const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Post = require('../models/post');

const JWT_SECRET = 'your_jwt_secret';

// Registration
router.post('/register', async (req, res) => {
    const { username, email, password, userType } = req.body; // Added userType to destructure
    try {
        if (!['student', 'alumni'].includes(userType)) {
            return res.status(400).json({ error: 'Invalid user type' });
        }

        const user = new User({ username, email, password, userType }); // Include userType
        await user.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, userType: user.userType }, JWT_SECRET, { expiresIn: '1h' }); // Include userType in token payload
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route to render the edit post form
router.get('/edit-post/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        res.render('edit-post', { post });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Route to handle post update
router.post('/update-post/:id', async (req, res) => {
    try {
        const { title, author, content } = req.body;
        await Post.findByIdAndUpdate(req.params.id, { title, author, content });
        res.redirect('/some-redirect-url'); // Redirect to a desired page after update
    } catch (err) {
        res.status(500).send('Server Error');
    }
});


module.exports = router;
