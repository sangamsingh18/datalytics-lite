

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        razorpay_order_id: {
            type: String,
            required: true,
            unique: true,
        },
        razorpay_payment_id: String,
        razorpay_signature: String,
        plan_name: {
            type: String,
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        diamonds: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        status: {
            type: String,
            default: 'created',
        },
        verified_at: Date,
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'payments',
    }
);

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

module.exports = { paymentSchema, Payment };