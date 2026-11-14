const mongoose = require("mongoose");

const timetableEntrySchema = new mongoose.Schema({
    className: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayOfWeek: { type: Number, required: true, min: 1, max: 5 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    activeFrom: { type: Date, required: true },
    activeTo: { type: Date, required: true }
}, { timestamps: true });

timetableEntrySchema.index({ className: 1, dayOfWeek: 1, startTime: 1, activeFrom: 1, activeTo: 1 });
module.exports = mongoose.model("TimetableEntry", timetableEntrySchema, "timetableEntries");
