# OCRS - Firebase Web App

Online Class Record and Academic Monitoring System for Southern Luzon State University - Lucena Campus.

This version uses:

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore
- Firebase Security Rules
- Cloud Functions
- Firebase Storage rules

## Project Files

```text
public/
  index.html
  admin-summary.html
  admin-users.html
  admin-grades.html
  faculty-encode.html
  faculty-grades.html
  faculty-report.html
  student-dashboard.html
  student-grades.html
  student-standing.html
  styles.css
  app.js
  firebase-config.js
  firebase-service.js

functions/
  index.js
  package.json

firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
storage.rules
```

Each page has its own HTML file. Shared Firebase logic is in `firebase-service.js`, and shared dashboard rendering is in `app.js`.

## Firebase Setup

1. Create a Firebase project.
2. Enable Authentication.
3. Enable Email/Password sign-in.
4. Enable Cloud Firestore.
5. Enable Firebase Storage.
6. Enable Cloud Functions.
7. Open `public/firebase-config.js`.
8. Replace all placeholder values with your Firebase web app config.
9. Open `.firebaserc`.
10. Replace `YOUR_FIREBASE_PROJECT_ID` with your Firebase project ID.

## Authentication And User Profiles

Create accounts in Firebase Authentication first. Do not store passwords in Firestore.

For every Firebase Auth user, create a matching Firestore document:

```text
users/{authUid}
```

Example student:

```json
{
  "fullName": "Juan Dela Cruz",
  "email": "juan@slsu.edu.ph",
  "studentNumber": "STU001",
  "role": "student",
  "program": "BSIT",
  "yearLevel": "2nd Year",
  "section": "BSIT 2A",
  "status": "active"
}
```

Example faculty:

```json
{
  "fullName": "Prof. Jose Reyes",
  "email": "jose.reyes@slsu.edu.ph",
  "employeeNumber": "FAC001",
  "role": "faculty",
  "department": "Computer Technology",
  "status": "active"
}
```

Example administrator:

```json
{
  "fullName": "Dr. Maria Santos",
  "email": "admin@slsu.edu.ph",
  "employeeNumber": "ADMIN001",
  "role": "admin",
  "department": "Administration",
  "status": "active"
}
```

## Firestore Collections

Recommended collections:

```text
users
academicYears
semesters
programs
subjects
sections
classes
enrollments
gradeRecords
attendanceRecords
reports
auditLogs
```

Example class:

```json
{
  "subjectId": "SUBJ_PROGRAMMING_1",
  "subjectName": "Programming 1",
  "sectionId": "BSIT_2A",
  "sectionName": "BSIT 2A",
  "academicYear": "2026-2027",
  "semester": "1st Semester",
  "facultyIds": ["FACULTY_AUTH_UID"],
  "locked": false
}
```

Grade records are created through the `calculateGradeRecord` Cloud Function, not directly by the browser.

## Deploy

Install Firebase CLI:

```text
npm install -g firebase-tools
```

Install Cloud Function dependencies:

```text
cd functions
npm install
cd ..
```

Log in and deploy:

```text
firebase login
firebase deploy
```

Deploy only hosting:

```text
firebase deploy --only hosting
```

Deploy rules:

```text
firebase deploy --only firestore:rules,storage
```

Deploy functions:

```text
firebase deploy --only functions
```

## Security Model

- Firebase Authentication handles passwords.
- Firestore stores user profiles and roles only.
- Students can read only their own records.
- Faculty can read assigned classes and encode records only through Cloud Functions.
- Admins manage users, academic setup, reports, and unlock requests.
- Grade records cannot be written directly by client code.
- Locking, unlocking, grade/GPA calculation, report creation, and audit logs are protected Cloud Functions.

