// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // 'student' or 'alumni'
    userType: { type: String, enum: ['student', 'alumni'], required: true },

    // Onboarding status
    onboarded: { type: Boolean, default: false },

    // Alumni-specific fields
    currentCompany: String,
    currentPosition: String,
    about: String,
    profilePic: String, // store path or URL

    // Student-specific fields
    batch: String,
    department: String,
}, { timestamps: true });

// Method to compare passwords
UserSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

// Pre-save hook to hash the password
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

module.exports = mongoose.model('User', UserSchema);
