const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const Post = require('./models/post');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use('/api/auth', authRoutes);

mongoose.connect('mongodb://localhost:27017/alumni', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.set('view engine', 'ejs'); // If you're using EJS templates

app.use('/auth', authRoutes);

// Route to render the edit page
app.get('/edit-post/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).send('Post not found');
        }
        res.render('edit-post', { post }); // Render the edit page with post data
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

app.post('/edit-post/:id', async (req, res) => {
    const postId = req.params.id;
    const { title, content } = req.body;

    try {
        const post = await Post.findByIdAndUpdate(postId, { title, content }, { new: true });
        if (!post) {
            return res.status(404).send('Post not found');
        }
        res.redirect(`/post/${postId}`); // Redirect to the updated post
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
