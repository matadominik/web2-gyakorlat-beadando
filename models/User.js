const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["user", "teacher", "admin", "superadmin"],
        default: "user"
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "disabled"],
        default: "approved"
    },
    displayName: {
        type: String,
        trim: true,
        default: ""
    },
    permissions: {
        type: [String],
        default: []
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        default: null
    }
});

module.exports = mongoose.model("User", userSchema);
