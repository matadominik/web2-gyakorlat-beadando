# 🖍️ "E-Crayon"

*Web-programozás II gyakorlat – beadandó feladat (Node.js)*

---

🎯 **Oldal:** [E-Crayon](https://web2-gyakorlat-beadando.onrender.com/)

📚 **Adatbázis:** 1-05-Napló-3 táblás

🎨 **Téma:** [Joson](https://themewagon.com/themes/free-bootstrap-4-html-5-education-website-template-joson/)

👥 **Készítették:**
- Mata László Dominik ([matadominik](https://github.com/matadominik)) – B223VA
- Fazekas Bence ([Bencuska0812](https://github.com/Bencuska0812)) – ZK6FMO

## Student registration and approval

- Students register with their full name, a class selected from the existing student classes, a username and a password.
- Registration creates a Student record and a linked User account with `status: "pending"`.
- Pending users cannot log in until an administrator approves the registration.
- Administrators approve or reject registrations on the Manage Grades page.
- Approved students can view only the grades linked to their own Student record.
- Existing administrator accounts remain administrators. Existing user records without a status are treated as approved for backward compatibility.

## Environment variables

Create a local `.env` file based on `.env.example`. Configure the same variables in the Render environment settings. Do not commit `.env` or database credentials.

Required variables: `MONGO_URI`, `SESSION_MONGO_URI`, and `SESSION_SECRET`.

## Run

```bash
npm install
npm start
```
