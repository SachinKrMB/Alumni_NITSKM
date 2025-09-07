// routes/posts.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Post = require("../models/post");

const router = express.Router();

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/"))
    cb(null, true);
  else cb(new Error("Only images/videos allowed"), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /posts/json
router.get("/json", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /posts
router.post("/", upload.array("media", 4), async (req, res) => {
  try {
    const authorName = (req.user && req.user.name) || "Anonymous";
    const authorAvatar = (req.user && req.user.avatarUrl) || "/img/default-avatar.png";

    const files = (req.files || []).map((f) => ({
      url: "/uploads/" + f.filename,
      mime: f.mimetype,
      size: f.size,
    }));

    const post = new Post({
      authorName,
      authorAvatar,
      content: req.body.content || "",
      media: files,
    });

    await post.save();
    res.redirect("back");
  } catch (err) {
    res.status(500).send("Server error: " + err.message);
  }
});

// POST /posts/:id/like
router.post("/:id/like", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // allow anonymous for now → count IP as "user"
    const userId = (req.user && req.user._id) || req.ip;

    const idx = post.likes.findIndex((id) => id == userId);
    if (idx >= 0) post.likes.splice(idx, 1);
    else post.likes.push(userId);

    await post.save();
    res.json({ likes: post.likes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
