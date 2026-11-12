const router = require("express").Router();
const controller = require("../controllers/mainController");
const User = require("../models/User");

const isLoggedIn = async (req, res, next) => {
    try {
        if (!req.session.user) return res.redirect("/login");

        const user = await User.findById(req.session.user.id);
        if (!user || ["pending", "rejected", "disabled"].includes(user.status)) {
            req.session.destroy(() => res.redirect("/login"));
            return;
        }

        req.session.user.role = user.role;
        req.session.user.username = user.username;
        req.session.user.permissions = user.permissions || [];
        next();
    } catch (err) {
        console.error("Authentication check error:", err);
        res.status(500).send("An authentication error occurred.");
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
        return res.status(403).send("You do not have permission to access this page.");
    }
    next();
};

const requirePermission = permission => (req, res, next) => {
    const user = req.session.user;
    const legacyAdmin = user && user.role === "admin";
    if (!user || !(legacyAdmin || (user.permissions || []).includes(permission))) {
        return res.status(403).send("You do not have permission to perform this action.");
    }
    next();
};

router.get("/", controller.homeIndex);
router.get("/register", controller.registerGet);
router.post("/register", controller.registerPost);
router.get("/login", controller.loginGet);
router.post("/login", controller.loginPost);
router.get("/contact", controller.contactGet);
router.post("/contact", controller.contactPost);

router.get("/gradebook", isLoggedIn, requireRole("user"), controller.gradebookIndex);
router.get("/stats", isLoggedIn, requireRole("user"), controller.statsIndex);
router.get("/feedback", isLoggedIn, requirePermission("viewMessages"), controller.feedbackIndex);
router.get("/logout", isLoggedIn, controller.logout);

router.get("/manage-grades", isLoggedIn, requirePermission("manageGrades"), controller.manageGradesIndex);
router.post("/manage-grades/approve-user", isLoggedIn, requirePermission("approveStudents"), controller.approveUser);
router.post("/manage-grades/reject-user", isLoggedIn, requirePermission("approveStudents"), controller.rejectUser);
router.post("/manage-grades/create", isLoggedIn, requirePermission("manageGrades"), controller.gradeCreate);
router.post("/manage-grades/update", isLoggedIn, requirePermission("manageGrades"), controller.gradeUpdate);
router.post("/manage-grades/delete", isLoggedIn, requirePermission("manageGrades"), controller.gradeDelete);

router.get("/manage-teachers", isLoggedIn, requireRole("superadmin"), controller.manageTeachersIndex);
router.post("/manage-teachers/create", isLoggedIn, requireRole("superadmin"), controller.createTeacher);
router.post("/manage-teachers/update", isLoggedIn, requireRole("superadmin"), controller.updateTeacher);
router.post("/manage-teachers/delete", isLoggedIn, requireRole("superadmin"), controller.deleteTeacher);
router.post("/manage-teachers/delete-student", isLoggedIn, requireRole("superadmin"), controller.deleteStudentProfile);

module.exports = router;
