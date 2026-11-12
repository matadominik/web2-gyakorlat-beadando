const router = require("express").Router();
const controller = require("../controllers/mainController");
const User = require("../models/User");

const isLoggedIn = async (req, res, next) => {
    try {
        if (!req.session.user) return res.redirect("/login");

        const user = await User.findById(req.session.user.id);
        if (!user || user.status === "pending" || user.status === "rejected") {
            req.session.destroy(() => res.redirect("/login"));
            return;
        }

        req.session.user.role = user.role;
        req.session.user.username = user.username;
        next();
    } catch (err) {
        console.error("Authentication check error:", err);
        res.status(500).send("An authentication error occurred.");
    }
};

const isAdmin = async (req, res, next) => {
    try {
        if (!req.session.user) return res.redirect("/login");

        const user = await User.findById(req.session.user.id);
        if (!user || user.role !== "admin" || user.status === "pending" || user.status === "rejected") {
            return res.redirect("/");
        }

        req.session.user.role = user.role;
        req.session.user.username = user.username;
        next();
    } catch (err) {
        console.error("Admin authorization error:", err);
        res.status(500).send("An authorization error occurred.");
    }
};

router.get("/", controller.homeIndex);
router.get("/register", controller.registerGet);
router.post("/register", controller.registerPost);
router.get("/login", controller.loginGet);
router.post("/login", controller.loginPost);
router.get("/contact", controller.contactGet);
router.post("/contact", controller.contactPost);

router.get("/gradebook", isLoggedIn, controller.gradebookIndex);
router.get("/stats", isLoggedIn, controller.statsIndex);
router.get("/feedback", isLoggedIn, controller.feedbackIndex);
router.get("/logout", isLoggedIn, controller.logout);

router.get("/manage-grades", isAdmin, controller.manageGradesIndex);
router.post("/manage-grades/approve-user", isAdmin, controller.approveUser);
router.post("/manage-grades/reject-user", isAdmin, controller.rejectUser);
router.post("/manage-grades/create", isAdmin, controller.gradeCreate);
router.post("/manage-grades/update", isAdmin, controller.gradeUpdate);
router.post("/manage-grades/delete", isAdmin, controller.gradeDelete);

module.exports = router;
