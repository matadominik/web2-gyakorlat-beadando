const router = require("express").Router();
const controller = require("../controllers/mainController");

isLoggedIn=(req,res,next)=>{
    if(req.session.user){return next();}
    res.redirect("/login");
}
isAdmin=(req,res,next)=>{
    if(req.session.user && req.session.user.role==="admin"){return next();}
    res.redirect("/");
}

router.get("/", controller.homeIndex);
router.get("/register", controller.registerGet);
router.post("/register", controller.registerPost);
router.get("/login", controller.loginGet);
router.post("/login", controller.loginPost);
router.get("/logout", controller.logout);
router.get("/gradebook", controller.gradebookIndex);
router.get("/contact", controller.contactGet);
router.post("/contact", controller.contactPost);
router.get("/stats", controller.statsIndex);
router.get("/feedback", isLoggedIn, controller.feedbackIndex);
router.get("/manage-grades", isAdmin, controller.manageGradesIndex);
router.post("/manage-grades/create", isAdmin, controller.gradeCreate);
router.post("/manage-grades/update", isAdmin, controller.gradeUpdate);
router.post("/manage-grades/delete", isAdmin, controller.gradeDelete);
module.exports = router;