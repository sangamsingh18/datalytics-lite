
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            default: '',
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        diamonds: {
            type: Number,
            default: 100,
        },
        plan: {
            type: String,
            default: 'Free',
        },
        role: {
            type: String,
            default: 'user',
        },
        provider: String,
        joined_at: Date,
        last_login: Date,
        last_payment_at: Date,
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'users',
    }
);

const DEFAULT_DIAMONDS = 100;

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = { DEFAULT_DIAMONDS, userSchema, User };