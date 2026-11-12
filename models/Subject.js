const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    teacherName: {
        type: String,
        required: true,
        trim: true
    }
});

module.exports = mongoose.model("Subject", subjectSchema, "subjects");
