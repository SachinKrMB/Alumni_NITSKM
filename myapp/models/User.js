// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userType: { type: String, enum: ['student', 'alumni'], required: true } // Added userType field
});

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
