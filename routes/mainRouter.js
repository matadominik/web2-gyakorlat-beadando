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

const requireTeacher = (req, res, next) => {
    if (!req.session.user || !["teacher", "admin"].includes(req.session.user.role)) {
        return res.status(403).send("You do not have permission to access this page.");
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
router.get("/timetable", isLoggedIn, requireRole("user"), controller.timetableIndex);
router.get("/feedback", isLoggedIn, requireTeacher, controller.feedbackIndex);
router.get("/logout", isLoggedIn, controller.logout);

router.get("/manage-grades", isLoggedIn, requireTeacher, controller.manageGradesIndex);
router.post("/manage-grades/create", isLoggedIn, requireTeacher, controller.gradeCreate);
router.post("/manage-grades/update", isLoggedIn, requireTeacher, controller.gradeUpdate);
router.post("/manage-grades/delete", isLoggedIn, requireTeacher, controller.gradeDelete);

router.get("/manage-teachers", isLoggedIn, requireRole("superadmin"), controller.manageTeachersIndex);
router.post("/manage-teachers/approve-user", isLoggedIn, requireRole("superadmin"), controller.approveUser);
router.post("/manage-teachers/reject-user", isLoggedIn, requireRole("superadmin"), controller.rejectUser);
router.post("/manage-teachers/promote", isLoggedIn, requireRole("superadmin"), controller.promoteStudentToTeacher);
router.post("/manage-teachers/change-password", isLoggedIn, requireRole("superadmin"), controller.changeAccountPassword);
router.post("/manage-teachers/delete", isLoggedIn, requireRole("superadmin"), controller.deleteTeacher);
router.post("/manage-teachers/delete-student", isLoggedIn, requireRole("superadmin"), controller.deleteStudentProfile);
router.post("/manage-teachers/move-student", isLoggedIn, requireRole("superadmin"), controller.moveStudentClass);
router.post("/manage-teachers/subjects/create", isLoggedIn, requireRole("superadmin"), controller.createSubject);
router.post("/manage-teachers/timetable/create", isLoggedIn, requireRole("superadmin"), controller.createTimetableEntry);
router.post("/manage-teachers/timetable/delete", isLoggedIn, requireRole("superadmin"), controller.deleteTimetableEntry);

module.exports = router;
