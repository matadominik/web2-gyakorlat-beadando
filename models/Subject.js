const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    teacherName: { type: String, trim: true, default: "" },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
});

module.exports = mongoose.model("Subject", subjectSchema, "subjects");
