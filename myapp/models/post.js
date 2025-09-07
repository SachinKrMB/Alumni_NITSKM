const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    authorName: { type: String, required: true },
    authorAvatar: { type: String, default: "/img/default-avatar.png" },
    content: { type: String, required: true },
    media: [{ url: String, mime: String, size: Number }],
    likes: [String], // allow strings (userId or IP) for now
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
