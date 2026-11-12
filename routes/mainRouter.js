const router = require("express").Router();
const controller = require("../controllers/mainController");

const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    return res.redirect("/login");
};


const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === "admin") {
        return next();
    }

    return res.redirect("/");
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

router.post(
    "/manage-grades/link-student",
    isAdmin,
    controller.linkStudent
);

router.post("/manage-grades/create", isAdmin, controller.gradeCreate);
router.post("/manage-grades/update", isAdmin, controller.gradeUpdate);
router.post("/manage-grades/delete", isAdmin, controller.gradeDelete);

module.exports = router;
