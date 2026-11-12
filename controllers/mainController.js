
const User = require("../models/User");
const SentMessage = require("../models/Message");
const bcrypt = require("bcrypt");

const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const SchoolClass = require("../models/SchoolClass");

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
        if (!req.session.user) {
            return res.redirect("/login");
        }

        let students = [];
        let subjects = [];
        let grades = [];
        let accountNotLinked = false;

        if (req.session.user.role === "admin") {
            students = await Student.find().sort({ name: 1 });
            subjects = await Subject.find().sort({ name: 1 });

            grades = await Grade.find()
                .populate("student")
                .populate("subject")
                .sort({ date: -1 });
        } else {
            const user = await User.findById(req.session.user.id)
                .populate("student");

            if (!user || !user.student) {
                accountNotLinked = true;
            } else {
                students = [user.student];

                grades = await Grade.find({
                    student: user.student._id
                })
                    .populate("student")
                    .populate("subject")
                    .sort({ date: -1 });

                const subjectIds = [
                    ...new Set(
                        grades
                            .filter(grade => grade.subject)
                            .map(grade => grade.subject._id.toString())
                    )
                ];

                subjects = await Subject.find({
                    _id: { $in: subjectIds }
                }).sort({ name: 1 });
            }
        }

        res.render("gradebook", {
            students,
            subjects,
            grades,
            accountNotLinked
        });
    } catch (err) {
        console.error("Gradebook error:", err);
        res.status(500).send("An error occurred while loading the gradebook.");
    }
};

exports.statsIndex = async (req, res) => {
    try {
        let match = {};

        if (req.session.user && req.session.user.role !== "admin") {
            const user = await User.findById(req.session.user.id);

            if (!user || !user.student) {
                return res.render("stats", {
                    gradeCounts: [0, 0, 0, 0, 0],
                    totalGrades: 0,
                    accountNotLinked: true
                });
            }

            match.student = user.student;
        }

        const result = await Grade.aggregate([
            { $match: match },
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

        const totalGrades = gradeCounts.reduce(
            (sum, count) => sum + count,
            0
        );

        res.render("stats", {
            gradeCounts,
            totalGrades,
            accountNotLinked: false
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
        const classes = await SchoolClass.find().sort({ name: 1 });

        const className = String(req.query.className || "").trim();
        const studentId = String(req.query.studentId || "").trim();
        const dateFrom = String(req.query.dateFrom || "").trim();
        const dateTo = String(req.query.dateTo || "").trim();

        const gradeQuery = {};
        let matchingStudentIds = null;

        if (className) {
            const validClass = await SchoolClass.findOne({ name: className });
            if (validClass) {
                matchingStudentIds = await Student.find({ className }).distinct("_id");
                gradeQuery.student = { $in: matchingStudentIds };
            } else {
                gradeQuery.student = { $in: [] };
            }
        }

        if (studentId && /^[a-fA-F0-9]{24}$/.test(studentId)) {
            const selectedStudent = await Student.findById(studentId);
            if (selectedStudent && (!className || selectedStudent.className === className)) {
                gradeQuery.student = selectedStudent._id;
            } else {
                gradeQuery.student = { $in: [] };
            }
        } else if (studentId) {
            gradeQuery.student = { $in: [] };
        }

        if (dateFrom || dateTo) {
            gradeQuery.date = {};
            if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) {
                gradeQuery.date.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
            }
            if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
                const endDate = new Date(`${dateTo}T00:00:00.000Z`);
                endDate.setUTCDate(endDate.getUTCDate() + 1);
                gradeQuery.date.$lt = endDate;
            }
            if (Object.keys(gradeQuery.date).length === 0) {
                delete gradeQuery.date;
            }
        }

        const grades = await Grade.find(gradeQuery)
            .populate("student")
            .populate("subject")
            .sort({ date: -1, _id: -1 });

        const pendingUsers = await User.find({ role: "user", status: "pending" })
            .populate("student")
            .sort({ username: 1 });
        const existingUsers = await User.find({ role: "user", status: { $ne: "pending" } })
            .populate("student")
            .sort({ username: 1 });

        let editGrade = null;
        if (req.query.edit) {
            editGrade = await Grade.findById(req.query.edit);
        }

        res.render("manageGrades", {
            students,
            subjects,
            classes,
            grades,
            editGrade,
            pendingUsers,
            existingUsers,
            filters: { className, studentId, dateFrom, dateTo }
        });
    } catch (err) {
        console.error("Manage grades error:", err);
        res.status(500).send("An error occurred while loading grades.");
    }
};

exports.approveUser = async (req, res) => {
    try {
        const user = await User.findOne({
            _id: req.body.userId,
            role: "user",
            status: "pending"
        });

        if (!user) {
            req.session.message = "Pending registration not found.";
            return res.redirect("/manage-grades");
        }

        user.status = "approved";
        await user.save();
        req.session.message = "Student registration approved successfully.";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Approve user error:", err);
        req.session.message = "Could not approve this registration.";
        res.redirect("/manage-grades");
    }
};

exports.rejectUser = async (req, res) => {
    try {
        const user = await User.findOne({
            _id: req.body.userId,
            role: "user",
            status: "pending"
        });

        if (!user) {
            req.session.message = "Pending registration not found.";
            return res.redirect("/manage-grades");
        }

        user.status = "rejected";
        await user.save();
        req.session.message = "Student registration rejected.";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Reject user error:", err);
        req.session.message = "Could not reject this registration.";
        res.redirect("/manage-grades");
    }
};

exports.registerGet = async (req, res) => {
    try {
        const classes = await SchoolClass.find().sort({ name: 1 });
        res.render("register", { classes });
    } catch (err) {
        console.error("Registration page error:", err);
        res.status(500).send("Could not load the registration page.");
    }
};

exports.registerPost = async (req, res) => {
    let createdStudent = null;

    try {
        const fullName = String(req.body.fullName || "").trim();
        const className = String(req.body.className || "").trim();
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (fullName.length < 3 || fullName.length > 100 ||
            username.length < 3 || username.length > 30 || password.length < 8 ||
            !className) {
            req.session.message = "Please provide a valid name, class, username and a password of at least 8 characters.";
            return res.redirect("/register");
        }

        const selectedClass = await SchoolClass.findOne({ name: className });
        if (!selectedClass) {
            req.session.message = "Please select a valid class from the list.";
            return res.redirect("/register");
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            req.session.message = "This username already exists.";
            return res.redirect("/register");
        }

        const bcryptHash = await bcrypt.hash(password, 12);
        const crypto = require("crypto");
        const studentId = `STU-${crypto.randomUUID()}`;

        createdStudent = await Student.create({
            studentId,
            name: fullName,
            className
        });

        await User.create({
            username,
            password: bcryptHash,
            role: "user",
            status: "pending",
            student: createdStudent._id
        });

        req.session.message = "Registration submitted successfully. Please wait for administrator approval before logging in.";
        res.redirect("/login");
    } catch (err) {
        if (createdStudent) {
            await Student.findByIdAndDelete(createdStudent._id).catch(() => {});
        }
        console.error("Registration error:", err);
        req.session.message = err.code === 11000
            ? "This username or student identifier is already in use. Please try again."
            : "An error occurred during registration. Please try again.";
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

        if (user.status === "pending") {
            req.session.message = "Your registration is waiting for administrator approval.";
            return res.redirect("/login");
        }

        if (user.status === "rejected") {
            req.session.message = "Your registration was not approved. Please contact the administrator.";
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

        res.redirect("/gradebook");
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
