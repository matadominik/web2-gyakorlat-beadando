const mongoose = require("mongoose");

const schoolClassSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    }
});

module.exports = mongoose.model("SchoolClass", schoolClassSchema, "classes");
