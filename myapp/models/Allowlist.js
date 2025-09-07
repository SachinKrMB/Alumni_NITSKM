// models/Allowlist.js
const mongoose = require('mongoose');

const AllowlistSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true, unique: true },
  name: String,          // optional
  alumniId: mongoose.Schema.Types.ObjectId // optional: points to full alumni record
}, { timestamps: true });

module.exports = mongoose.model('Allowlist', AllowlistSchema);
