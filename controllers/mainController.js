
const User = require("../models/User");
const SentMessage = require("../models/Message");
const DirectMessage = require("../models/DirectMessage");
const bcrypt = require("bcrypt");

const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const SchoolClass = require("../models/SchoolClass");
const TimetableEntry = require("../models/TimetableEntry");

const getAccountLabel = (account) => {
    if (!account) return "Unknown user";
    if (account.student && account.student.name) return account.student.name;
    return account.displayName || account.username || "Unknown user";
};

async function canUsersMessage(first, second) {
    if (!first || !second || first._id.equals(second._id)) return false;
    const roles = [first.role, second.role].sort().join(":");
    if (roles !== "teacher:user") return false;

    const studentAccount = first.role === "user" ? first : second;
    const teacherAccount = first.role === "teacher" ? first : second;
    const student = await Student.findById(studentAccount.student);
    if (!student) return false;

    const timetableLink = await TimetableEntry.exists({
        teacher: teacherAccount._id,
        className: student.className
    });
    if (timetableLink) return true;

    return false;
}

async function getAllowedMessageContacts(account) {
    if (account.role === "user") {
        const student = await Student.findById(account.student);
        if (!student) return [];
        const entries = await TimetableEntry.find({ className: student.className }).distinct("teacher");
        const ids = [...new Set(entries.map(id => String(id)))];
        const teachers = await User.find({ _id: { $in: ids }, role: "teacher", status: { $nin: ["disabled", "rejected", "pending"] } }).sort({ displayName: 1, username: 1 });
        const assignedSubjects = await Subject.find({ teacher: { $in: teachers.map(t => t._id) } }).select("teacher teacherName");
        const teacherNames = new Map(assignedSubjects.map(subject => [String(subject.teacher), subject.teacherName]));
        return teachers.map(t => ({ _id: t._id, label: `${t.displayName || teacherNames.get(String(t._id)) || t.username} (Teacher)`, role: t.role }));
    }
    if (account.role === "teacher") {
        const classNames = await TimetableEntry.find({ teacher: account._id }).distinct("className");
        const students = await Student.find({ className: { $in: classNames } });
        const users = await User.find({ role: "user", student: { $in: students.map(s => s._id) }, status: { $nin: ["disabled", "rejected", "pending"] } }).populate("student").sort({ username: 1 });
        return users.map(u => ({ _id: u._id, label: `${getAccountLabel(u)} (${u.student ? u.student.className : "Student"})`, role: u.role, className: u.student ? u.student.className : "" }));
    }
    return [];
}

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

exports.messagesIndex = async (req, res) => {
    try {
        const account = await User.findById(req.session.user.id).populate("student");
        const contacts = await getAllowedMessageContacts(account);
        const selectedId = String(req.query.to || "");
        let selectedContact = null;
        if (selectedId && /^[a-fA-F0-9]{24}$/.test(selectedId)) {
            selectedContact = contacts.find(c => String(c._id) === selectedId) || null;
        }

        const messages = await DirectMessage.find({
            $or: [{ sender: account._id }, { recipient: account._id }]
        }).sort({ createdAt: 1 }).populate("sender", "username displayName role student").populate({ path: "sender", populate: { path: "student" } });

        const conversationMap = new Map();
        for (const item of messages) {
            const otherId = String(item.sender._id) === String(account._id) ? String(item.recipient) : String(item.sender._id);
            const contact = contacts.find(c => String(c._id) === otherId);
            if (!contact) continue;
            if (!conversationMap.has(otherId)) conversationMap.set(otherId, { contact, messages: [] });
            conversationMap.get(otherId).messages.push(item);
        }

        let thread = [];
        if (selectedContact) {
            thread = messages.filter(m =>
                (String(m.sender._id) === String(account._id) && String(m.recipient) === selectedId) ||
                (String(m.sender._id) === selectedId && String(m.recipient) === String(account._id))
            );
            await DirectMessage.updateMany({ sender: selectedId, recipient: account._id, readAt: null }, { $set: { readAt: new Date() } });
        }

        res.render("messages", {
            contacts,
            conversations: [...conversationMap.values()].sort((a, b) => new Date(b.messages[b.messages.length - 1].createdAt) - new Date(a.messages[a.messages.length - 1].createdAt)),
            selectedContact,
            thread,
            currentAccount: account
        });
    } catch (err) {
        console.error("Messages page error:", err);
        res.status(500).send("Could not load messages.");
    }
};

exports.sendDirectMessage = async (req, res) => {
    try {
        const recipientId = String(req.body.recipient || "");
        const body = String(req.body.body || "").trim();
        if (!/^[a-fA-F0-9]{24}$/.test(recipientId) || body.length < 1 || body.length > 4000) {
            req.session.message = "Please select a recipient and enter a message (maximum 4000 characters).";
            return res.redirect("/messages");
        }
        const sender = await User.findById(req.session.user.id).populate("student");
        const recipient = await User.findById(recipientId).populate("student");
        if (!recipient || !["user", "teacher"].includes(recipient.role) || !(await canUsersMessage(sender, recipient))) {
            req.session.message = "You are not allowed to message this user.";
            return res.redirect("/messages");
        }
        let senderName = getAccountLabel(sender);
        if (sender.role === "teacher" && !sender.displayName) {
            const assignedSubject = await Subject.findOne({ teacher: sender._id }).select("teacherName");
            if (assignedSubject && assignedSubject.teacherName) senderName = assignedSubject.teacherName;
        }
        await DirectMessage.create({
            sender: sender._id,
            recipient: recipient._id,
            body,
            senderName,
            senderRole: sender.role,
            senderClass: sender.student ? sender.student.className : ""
        });
        req.session.message = "Message sent.";
        res.redirect(`/messages?to=${recipient._id}`);
    } catch (err) {
        console.error("Send message error:", err);
        req.session.message = "Could not send the message.";
        res.redirect("/messages");
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
        let teachers = [];
        let accountNotLinked = false;

        if (req.session.user.role === "admin") {
            students = await Student.find().sort({ name: 1 });
            subjects = await Subject.find().sort({ name: 1 });

            grades = await Grade.find()
                .populate("student")
                .populate("subject")
                .populate("teacher")
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
                    .populate("teacher")
                    .sort({ date: -1 });

                const subjectIds = [
                    ...new Set(
                        grades
                            .filter(grade => grade.subject)
                            .map(grade => grade.subject._id.toString())
                    )
                ];

                const classTimetable = await TimetableEntry.find({ className: user.student.className }).populate("subject").populate("teacher");
                const subjectMap = new Map();
                classTimetable.forEach(entry => {
                    if (entry.subject) subjectMap.set(String(entry.subject._id), entry.subject);
                });
                subjects = [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name));
                const teacherMap = new Map();
                classTimetable.forEach(entry => {
                    if (entry.teacher) teacherMap.set(String(entry.teacher._id), entry.teacher);
                });
                teachers = [...teacherMap.values()].sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
            }
        }

        res.render("gradebook", {
            students,
            subjects,
            grades,
            teachers,
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

        if (req.session.user && req.session.user.role === "teacher") {
            // A tanár statisztikája kizárólag az általa rögzített jegyekből készül.
            match.teacher = new (require("mongoose").Types.ObjectId)(req.session.user.id);
        } else if (req.session.user && req.session.user.role !== "admin") {
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
        const isTeacherView = ["teacher", "admin"].includes(req.session.user.role);
        let students;
        let existingUsers;
        let teacherClassNames = [];

        if (isTeacherView) {
            const teacherEntries = await TimetableEntry.find({ teacher: req.session.user.id }).populate("subject");
            teacherClassNames = [...new Set(teacherEntries.map(entry => entry.className))];
            const teacherStudents = await Student.find({ className: { $in: teacherClassNames } }).sort({ name: 1 });
            const teacherSubjectsByClass = {};
            teacherEntries.forEach(entry => {
                teacherSubjectsByClass[entry.className] ||= new Set();
                if (entry.subject) teacherSubjectsByClass[entry.className].add(entry.subject.name);
            });
            students = teacherStudents;
            existingUsers = await User.find({ role: "user", student: { $in: teacherStudents.map(student => student._id) } })
                .populate("student").sort({ username: 1 });
            existingUsers = existingUsers.map(account => {
                const student = account.student;
                return {
                    ...account.toObject(),
                    student,
                    subjectsForStudent: student ? [...(teacherSubjectsByClass[student.className] || [])].sort() : []
                };
            });
        } else {
            students = await Student.find().sort({ name: 1 });
            existingUsers = await User.find({ role: "user", status: { $ne: "pending" } })
                .populate("student").sort({ username: 1 });
        }

        const subjects = await Subject.find().populate("teacher").sort({ name: 1 });
        const classes = await SchoolClass.find().sort({ name: 1 });

        const className = String(req.query.className || "").trim();
        const studentId = String(req.query.studentId || "").trim();
        const dateFrom = String(req.query.dateFrom || "").trim();
        const dateTo = String(req.query.dateTo || "").trim();

        const gradeQuery = {};
        // A tanár kizárólag a saját maga által rögzített jegyeket láthatja.
        // Az adminisztrátor továbbra is minden jegyet megtekinthet.
        if (req.session.user.role === "teacher") {
            gradeQuery.teacher = req.session.user.id;
        }
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
            .populate("teacher")
            .sort({ date: -1, _id: -1 });

        const canApproveStudents = false;
        const pendingUsers = await User.find({ role: "user", status: "pending" })
            .populate("student")
            .sort({ username: 1 });
        let editGrade = null;
        if (req.query.edit) {
            const editQuery = { _id: req.query.edit };
            if (req.session.user.role === "teacher") {
                editQuery.teacher = req.session.user.id;
            }
            editGrade = await Grade.findOne(editQuery);
        }

        res.render("manageGrades", {
            students,
            subjects,
            classes,
            grades,
            editGrade,
            pendingUsers,
            existingUsers,
            filters: { className, studentId, dateFrom, dateTo },
            canApproveStudents,
            isTeacherView
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
            return res.redirect("/manage-teachers");
        }

        user.status = "approved";
        await user.save();
        req.session.message = "Student registration approved successfully.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Approve user error:", err);
        req.session.message = "Could not approve this registration.";
        res.redirect("/manage-teachers");
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
            return res.redirect("/manage-teachers");
        }

        user.status = "rejected";
        await user.save();
        req.session.message = "Student registration rejected.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Reject user error:", err);
        req.session.message = "Could not reject this registration.";
        res.redirect("/manage-teachers");
    }
};

exports.manageTeachersIndex = async (req, res) => {
    try {
        const teachers = await User.find({ role: { $in: ["teacher", "admin"] } }).populate("student").sort({ username: 1 });
        const studentAccounts = await User.find({ role: "user" }).populate("student").sort({ username: 1 });
        const pendingUsers = await User.find({ role: "user", status: "pending" }).populate("student").sort({ username: 1 });
        const classes = await SchoolClass.find().sort({ name: 1 });
        const subjects = await Subject.find().populate({ path: "teacher", populate: { path: "student" } }).sort({ name: 1 });
        const timetableEntries = await TimetableEntry.find().populate("subject").populate({ path: "teacher", populate: { path: "student" } }).sort({ className: 1, dayOfWeek: 1, startTime: 1 });
        const academicYearStart = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
        res.render("manageTeachers", { teachers, studentAccounts, pendingUsers, classes, subjects, timetableEntries, defaultActiveFrom: `${academicYearStart}-09-01`, defaultActiveTo: `${academicYearStart + 1}-05-31` });
    } catch (err) {
        console.error("Manage teachers error:", err);
        res.status(500).send("An error occurred while loading account management.");
    }
};

exports.promoteStudentToTeacher = async (req, res) => {
    try {
        const account = await User.findOne({ _id: req.body.userId, role: "user" });
        if (!account) {
            req.session.message = "Registered student account not found.";
            return res.redirect("/manage-teachers");
        }
        if (account.status !== "approved") {
            req.session.message = "Only approved accounts can be promoted to teacher.";
            return res.redirect("/manage-teachers");
        }
        account.role = "teacher";
        account.permissions = [];
        await account.save();
        req.session.message = `${account.username} is now a teacher.`;
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Promote student error:", err);
        req.session.message = "Could not change this account to a teacher.";
        res.redirect("/manage-teachers");
    }
};

exports.changeAccountPassword = async (req, res) => {
    try {
        const password = String(req.body.password || "");
        if (password.length < 8 || password.length > 128) {
            req.session.message = "The new password must be between 8 and 128 characters.";
            return res.redirect("/manage-teachers");
        }
        const account = await User.findOne({
            _id: req.body.userId,
            role: { $in: ["user", "teacher", "admin"] }
        });
        if (!account) {
            req.session.message = "Account not found.";
            return res.redirect("/manage-teachers");
        }
        account.password = await bcrypt.hash(password, 12);
        await account.save();
        req.session.message = `Password changed for ${account.username}.`;
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Change account password error:", err);
        req.session.message = "Could not change the account password.";
        res.redirect("/manage-teachers");
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const teacher = await User.findOne({ _id: req.body.userId, role: "teacher" });
        if (teacher && teacher.student) {
            await Grade.deleteMany({ student: teacher.student });
            await Student.findByIdAndDelete(teacher.student);
        }
        if (teacher) {
            await TimetableEntry.deleteMany({ teacher: teacher._id });
            await User.findByIdAndDelete(teacher._id);
        }
        req.session.message = teacher ? "Teacher account deleted." : "Teacher account not found.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Delete teacher error:", err);
        req.session.message = "Could not delete the teacher account.";
        res.redirect("/manage-teachers");
    }
};

exports.deleteStudentProfile = async (req, res) => {
    try {
        const studentUser = await User.findOne({
            _id: req.body.userId,
            role: "user"
        });

        if (!studentUser) {
            req.session.message = "Student account not found.";
            return res.redirect("/manage-teachers");
        }

        if (studentUser.student) {
            await Grade.deleteMany({ student: studentUser.student });
            await Student.findByIdAndDelete(studentUser.student);
        }

        await User.findByIdAndDelete(studentUser._id);

        req.session.message = "Student profile, account and associated grades were deleted.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Delete student profile error:", err);
        req.session.message = "Could not delete the student profile.";
        res.redirect("/manage-teachers");
    }
};

exports.moveStudentClass = async (req, res) => {
    try {
        const account = await User.findOne({ _id: req.body.userId, role: "user" }).populate("student");
        const className = String(req.body.className || "").trim();
        const targetClass = await SchoolClass.findOne({ name: className });
        if (!account || !account.student || !targetClass) {
            req.session.message = "Student or target class was not found.";
            return res.redirect("/manage-teachers");
        }
        account.student.className = targetClass.name;
        await account.student.save();
        req.session.message = `${account.student.name} moved to ${targetClass.name}.`;
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Move student class error:", err);
        req.session.message = "Could not move the student to the selected class.";
        res.redirect("/manage-teachers");
    }
};

exports.createSubject = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const teacherId = String(req.body.teacherId || "").trim();
        const teacher = await User.findOne({ _id: teacherId, role: { $in: ["teacher", "admin"] }, status: { $ne: "disabled" } });
        if (name.length < 2 || name.length > 80 || !teacher) {
            req.session.message = "Enter a valid subject name and select an active teacher.";
            return res.redirect("/manage-teachers");
        }
        await Subject.create({ name, teacher: teacher._id, teacherName: teacher.displayName || teacher.username });
        req.session.message = "Subject created and assigned to the selected teacher.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Create subject error:", err);
        req.session.message = err.code === 11000 ? "This subject already exists." : "Could not create the subject.";
        res.redirect("/manage-teachers");
    }
};

exports.createTimetableEntry = async (req, res) => {
    try {
        const className = String(req.body.className || "").trim();
        const subjectId = String(req.body.subjectId || "").trim();
        const dayOfWeek = Number(req.body.dayOfWeek);
        const startTime = String(req.body.startTime || "");
        const endTime = String(req.body.endTime || "");
        const activeFrom = new Date(`${req.body.activeFrom}T00:00:00.000Z`);
        const activeTo = new Date(`${req.body.activeTo}T23:59:59.999Z`);
        const validClass = await SchoolClass.findOne({ name: className });
        const subject = await Subject.findById(subjectId).populate("teacher");
        const teacher = subject && subject.teacher && ["teacher", "admin"].includes(subject.teacher.role) && subject.teacher.status !== "disabled" ? subject.teacher : null;
        const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!validClass || !subject || !teacher || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5 || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime || Number.isNaN(activeFrom.getTime()) || Number.isNaN(activeTo.getTime()) || activeFrom > activeTo) {
            req.session.message = "Please check the class, subject, teacher, day, times and school-year dates.";
            return res.redirect("/manage-teachers");
        }
        const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;
        const existing = await TimetableEntry.find({ className, dayOfWeek, activeFrom: { $lte: activeTo }, activeTo: { $gte: activeFrom } });
        if (existing.some(item => overlap(startTime, endTime, item.startTime, item.endTime))) {
            req.session.message = "This class already has a lesson scheduled in that time slot.";
            return res.redirect("/manage-teachers");
        }
        const teacherEntries = await TimetableEntry.find({ teacher: teacher._id, dayOfWeek, activeFrom: { $lte: activeTo }, activeTo: { $gte: activeFrom } });
        if (teacherEntries.some(item => overlap(startTime, endTime, item.startTime, item.endTime))) {
            req.session.message = "This teacher already has a lesson scheduled in that time slot.";
            return res.redirect("/manage-teachers");
        }
        await TimetableEntry.create({ className, subject: subject._id, teacher: teacher._id, dayOfWeek, startTime, endTime, activeFrom, activeTo });
        req.session.message = "Weekly timetable lesson added successfully.";
        res.redirect("/manage-teachers");
    } catch (err) {
        console.error("Create timetable entry error:", err);
        req.session.message = "Could not add the timetable lesson.";
        res.redirect("/manage-teachers");
    }
};

exports.deleteTimetableEntry = async (req, res) => {
    try {
        await TimetableEntry.findByIdAndDelete(req.body.entryId);
        req.session.message = "Timetable lesson deleted.";
    } catch (err) {
        console.error("Delete timetable entry error:", err);
        req.session.message = "Could not delete the timetable lesson.";
    }
    res.redirect("/manage-teachers");
};

exports.timetableIndex = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).populate("student");
        if (!user) return res.status(404).send("User not found.");
        const now = new Date();
        const year = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
        const periodStart = new Date(Date.UTC(year, 8, 1));
        const periodEnd = new Date(Date.UTC(year + 1, 4, 31, 23, 59, 59, 999));

        let weekStart;
        const requestedWeek = String(req.query.week || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)) {
            const parsed = new Date(`${requestedWeek}T00:00:00.000Z`);
            if (!Number.isNaN(parsed.getTime())) weekStart = parsed;
        }
        if (!weekStart) {
            weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const weekday = weekStart.getUTCDay() || 7;
            weekStart.setUTCDate(weekStart.getUTCDate() - weekday + 1);
        }
        weekStart.setUTCHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const previousWeek = new Date(weekStart);
        previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
        const nextWeek = new Date(weekStart);
        nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

        const isTeacher = ["teacher", "admin"].includes(user.role);
        let timetableQuery;
        let className = "";
        if (isTeacher) {
            timetableQuery = { teacher: user._id };
        } else {
            if (!user.student) return res.status(404).send("Student profile not found.");
            className = user.student.className;
            timetableQuery = { className };
        }
        timetableQuery.activeFrom = { $lte: weekEnd };
        timetableQuery.activeTo = { $gte: weekStart };
        const timetableEntries = await TimetableEntry.find(timetableQuery)
            .populate("subject").populate({ path: "teacher", populate: { path: "student" } }).sort({ dayOfWeek: 1, startTime: 1 });

        res.render("timetable", {
            timetableEntries, className, periodStart, periodEnd, weekStart, weekEnd,
            previousWeek, nextWeek, isTeacher
        });
    } catch (err) {
        console.error("Timetable error:", err);
        res.status(500).send("Could not load the timetable.");
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

        if (user.status === "disabled") {
            req.session.message = "This account has been disabled. Please contact the system administrator.";
            return res.redirect("/login");
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            permissions: user.permissions || []
        };

        if (user.role === "superadmin") {
            return res.redirect("/manage-teachers");
        }

        if (user.role === "teacher" || user.role === "admin") {
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

exports.contactGet = async (req, res) => {
    let contactIdentity = null;
    if (req.session.user) {
        const account = await User.findById(req.session.user.id).populate("student");
        if (account) contactIdentity = { name: getAccountLabel(account), email: account.username };
    }
    res.render("contact", { contactIdentity });
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
            ...(req.session.user.role === "teacher" ? { teacher: req.session.user.id } : {}),
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

        const gradeFilter = { _id: id };
        if (req.session.user.role === "teacher") {
            gradeFilter.teacher = req.session.user.id;
        }
        const updatedGrade = await Grade.findOneAndUpdate(
            gradeFilter,
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
        if (!updatedGrade) {
            req.session.message = "You can only edit grades entered by you.";
            return res.redirect("/manage-grades");
        }

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
        const gradeFilter = { _id: req.body.id };
        if (req.session.user.role === "teacher") {
            gradeFilter.teacher = req.session.user.id;
        }
        const deletedGrade = await Grade.findOneAndDelete(gradeFilter);
        if (!deletedGrade) {
            req.session.message = "You can only delete grades entered by you.";
            return res.redirect("/manage-grades");
        }

        req.session.message = "Grade deleted successfully!";
        res.redirect("/manage-grades");
    } catch (err) {
        console.error("Grade delete error:", err);
        req.session.message = "Failed to delete grade.";
        res.redirect("/manage-grades");
    }
};
