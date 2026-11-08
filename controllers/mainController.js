const User = require("../models/User");
const SentMessage = require("../models/Message");
const bcrypt = require("bcrypt");

exports.homeIndex = (req, res) => { res.render("home"); };
exports.feedbackIndex = (req, res) => { res.render("feedback"); };
exports.gradebookIndex = (req, res) => { res.render("gradebook"); };
exports.statsIndex = (req, res) => { res.render("stats"); };
exports.manageGradesIndex = (req, res) => { res.render("manageGrades"); };

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
    if (req.body.fullName == "" || req.body.emailAddress == "" || req.body.inputMessage == "") {
        req.session.message = "Failed to send message!";
        return res.redirect("/contact");
    }
    await SentMessage.create({ name: req.body.fullName, email: req.body.emailAddress, message: req.body.inputMessage });
    req.session.message = "Message sent!";
    res.redirect("/contact");
};