const mongoose = require("mongoose");

const directMessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 4000 },
    senderName: { type: String, required: true, trim: true },
    senderRole: { type: String, required: true },
    senderClass: { type: String, default: "" },
    readAt: { type: Date, default: null }
}, { timestamps: true });

directMessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
module.exports = mongoose.model("DirectMessage", directMessageSchema, "directMessages");
