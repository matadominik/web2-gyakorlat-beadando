const User = require("../models/User");
const SentMessage = require("../models/Message");
const bcrypt = require("bcrypt");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");

exports.homeIndex = (req, res) => { res.render("home"); };
exports.feedbackIndex = async (req, res) => {
    const messages = await SentMessage.find().sort({ _id: -1 });
    res.render("feedback", { messages });
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
        res.status(500).send("Hiba történt az adatbázis lekérdezésekor.");
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
        res.status(500).send("Hiba történt a statisztika betöltésekor.");
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
        res.status(500).send("Hiba történt a jegyek betöltésekor.");
    }
};

exports.registerGet = (req, res) => { res.render("register"); };
exports.registerPost = async (req, res) => {
    if (req.body.username == "" || req.body.password == "") {
        req.session.message = "Registration failed!";
        return res.redirect("/register");
    }
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser) {
        req.session.message = "This user already exists!";
        return res.redirect("/register");
    }
    const hash = await bcrypt.hash(req.body.password, 10);
    await User.create({ username: req.body.username, password: hash, role: "user" });
    req.session.message = "Successful registration! You can log in.";
    res.redirect("/login");
};

exports.loginGet = (req, res) => { res.render("login"); };
exports.loginPost = async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
        req.session.message = "Login failed!";
        return res.redirect("/login");
    }
    const ok = await bcrypt.compare(req.body.password, user.password);
    if (!ok) {
        req.session.message = "Login failed!";
        return res.redirect("/login");
    }
    req.session.user = { id: user._id, username: user.username, role: user.role };
    if (user.role === "admin") {
        res.redirect("/manage-grades");
    } else {
        res.redirect("/feedback");
    }
};
exports.logout = (req, res) => {
    req.session.destroy(() => { res.redirect("/login"); });
};

exports.contactGet = (req, res) => { res.render("contact"); };


exports.contactPost = async (req, res) => {
    try {
        const name = String(req.body.fullName || "").trim();
        const email = String(req.body.emailAddress || "").trim();
        const message = String(req.body.inputMessage || "").trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (name.length < 3 || name.length > 100) {
            req.session.message = "A név 3–100 karakter hosszú lehet!";
            return res.redirect("/contact");
        }

        if (!emailRegex.test(email) || email.length > 254) {
            req.session.message = "Érvénytelen e-mail-cím!";
            return res.redirect("/contact");
        }

        if (message.length < 10 || message.length > 2000) {
            req.session.message = "Az üzenet 10–2000 karakter hosszú lehet!";
            return res.redirect("/contact");
        }

        await SentMessage.create({
            name,
            email,
            message
        });

        req.session.message = "Az üzenetet sikeresen elküldted!";
        res.redirect("/contact");

    } catch (err) {
        console.error("Contact error:", err);
        req.session.message = "Hiba történt az üzenet mentésekor!";
        res.redirect("/contact");
    }
};


exports.gradeCreate = async (req, res) => {
    try {
        const { student, subject, value, type, date, note } = req.body;

        if (!student || !subject || !value || !type) {
            req.session.message = "Minden kötelező mezőt ki kell tölteni!";
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

        req.session.message = "A jegy sikeresen rögzítve!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade create error:", err);
        req.session.message = "Nem sikerült rögzíteni a jegyet!";
        res.redirect("/manage-grades");
    }
};


exports.gradeUpdate = async (req, res) => {
    try {
        const { id, student, subject, value, type, date, note } = req.body;

        await Grade.findByIdAndUpdate(id, {
            student,
            subject,
            value: Number(value),
            type,
            date: date || Date.now(),
            note
        }, { runValidators: true });

        req.session.message = "A jegy sikeresen módosítva!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade update error:", err);
        req.session.message = "Nem sikerült módosítani a jegyet!";
        res.redirect("/manage-grades");
    }
};


exports.gradeDelete = async (req, res) => {
    try {
        await Grade.findByIdAndDelete(req.body.id);

        req.session.message = "A jegy sikeresen törölve!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade delete error:", err);
        req.session.message = "Nem sikerült törölni a jegyet!";
        res.redirect("/manage-grades");
    }
};