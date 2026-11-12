const User = require("../models/User");
const SentMessage = require("../models/Message");
const bcrypt = require("bcrypt");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");


exports.homeIndex = (req, res) => {
    res.render("home");
};

exports.feedbackIndex = async (req, res) => {
    try {
        const messages = await SentMessage.find().sort({ _id: -1 });
        res.render("feedback", { messages });
    } catch (err) {
        console.error("Messages error:", err);
        res.status(500).send("An error occurred while loading messages.");
    }
};


exports.gradebookIndex = async (req, res) => {
    try {
        const students = await Student.find().sort({ name: 1 });
        const subjects = await Subject.find().sort({ name: 1 });

        const grades = await Grade.find()
            .populate("student")
            .populate("subject")
            .sort({ date: -1 });

        res.render("gradebook", {
            students,
            subjects,
            grades
        });
    } catch (err) {
        console.error("Gradebook error:", err);
        res.status(500).send("An error occurred while loading the gradebook.");
    }
};


exports.statsIndex = async (req, res) => {
    try {
        const result = await Grade.aggregate([
            {
                $group: {
                    _id: "$value",
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const gradeCounts = [1, 2, 3, 4, 5].map(value => {
            const found = result.find(item => item._id === value);
            return found ? found.count : 0;
        });

        const totalGrades = gradeCounts.reduce((sum, count) => sum + count, 0);

        res.render("stats", {
            gradeCounts,
            totalGrades
        });
    } catch (err) {
        console.error("Statistics error:", err);
        res.status(500).send("An error occurred while loading statistics.");
    }
};


exports.manageGradesIndex = async (req, res) => {
    try {
        const students = await Student.find().sort({ name: 1 });
        const subjects = await Subject.find().sort({ name: 1 });

        const grades = await Grade.find()
            .populate("student")
            .populate("subject")
            .sort({ date: -1 });

        let editGrade = null;

        if (req.query.edit) {
            editGrade = await Grade.findById(req.query.edit);
        }

        res.render("manageGrades", {
            students,
            subjects,
            grades,
            editGrade
        });
    } catch (err) {
        console.error("Manage grades error:", err);
        res.status(500).send("An error occurred while loading grades.");
    }
};


exports.registerGet = (req, res) => {
    res.render("register");
};

exports.registerPost = async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            req.session.message = "Registration failed. Please fill in all fields.";
            return res.redirect("/register");
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            req.session.message = "This username already exists.";
            return res.redirect("/register");
        }

        const hash = await bcrypt.hash(password, 10);

        await User.create({
            username,
            password: hash,
            role: "user"
        });

        req.session.message = "Registration successful! You can now log in.";
        res.redirect("/login");
    } catch (err) {
        console.error("Registration error:", err);
        req.session.message = "An error occurred during registration.";
        res.redirect("/register");
    }
};


exports.loginGet = (req, res) => {
    res.render("login");
};

exports.loginPost = async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        const user = await User.findOne({ username });

        if (!user) {
            req.session.message = "Login failed. Check your username and password.";
            return res.redirect("/login");
        }

        const passwordMatches = await bcrypt.compare(password, user.password);

        if (!passwordMatches) {
            req.session.message = "Login failed. Check your username and password.";
            return res.redirect("/login");
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        if (user.role === "admin") {
            return res.redirect("/manage-grades");
        }

        res.redirect("/feedback");
    } catch (err) {
        console.error("Login error:", err);
        req.session.message = "An error occurred during login.";
        res.redirect("/login");
    }
};


exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
};


exports.contactGet = (req, res) => {
    res.render("contact");
};

exports.contactPost = async (req, res) => {
    try {
        const name = String(req.body.fullName || "").trim();
        const email = String(req.body.emailAddress || "").trim();
        const message = String(req.body.inputMessage || "").trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (name.length < 3 || name.length > 100) {
            req.session.message = "The name must be between 3 and 100 characters.";
            return res.redirect("/contact");
        }

        if (!emailRegex.test(email) || email.length > 254) {
            req.session.message = "Please enter a valid email address.";
            return res.redirect("/contact");
        }

        if (message.length < 10 || message.length > 2000) {
            req.session.message = "The message must be between 10 and 2000 characters.";
            return res.redirect("/contact");
        }

        await SentMessage.create({
            name,
            email,
            message
        });

        req.session.message = "Your message has been sent successfully!";
        res.redirect("/contact");
    } catch (err) {
        console.error("Contact error:", err);
        req.session.message = "An error occurred while saving your message.";
        res.redirect("/contact");
    }
};


exports.gradeCreate = async (req, res) => {
    try {
        const { student, subject, value, type, date, note } = req.body;

        if (!student || !subject || !value || !type) {
            req.session.message = "Please fill in all required fields.";
            return res.redirect("/manage-grades");
        }

        await Grade.create({
            student,
            subject,
            value: Number(value),
            type,
            date: date || Date.now(),
            note
        });

        req.session.message = "Grade added successfully!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade create error:", err);
        req.session.message = "Failed to add grade.";
        res.redirect("/manage-grades");
    }
};


exports.gradeUpdate = async (req, res) => {
    try {
        const { id, student, subject, value, type, date, note } = req.body;

        await Grade.findByIdAndUpdate(
            id,
            {
                student,
                subject,
                value: Number(value),
                type,
                date: date || Date.now(),
                note
            },
            { runValidators: true }
        );

        req.session.message = "Grade updated successfully!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade update error:", err);
        req.session.message = "Failed to update grade.";
        res.redirect("/manage-grades");
    }
};


exports.gradeDelete = async (req, res) => {
    try {
        await Grade.findByIdAndDelete(req.body.id);

        req.session.message = "Grade deleted successfully!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade delete error:", err);
        req.session.message = "Failed to delete grade.";
        res.redirect("/manage-grades");
    }
};
