import {
  authReady,
  createGradeRecord,
  exportReport,
  getRecentAuditLogs,
  getUserProfile,
  lockGradeRecord,
  login,
  logout,
  unlockGradeRecord,
  updateUserStatus,
  watchAllGrades,
  watchAssignedGrades,
  watchClassesForFaculty,
  watchStudentGrades,
  watchUserProfile,
  watchUsers
} from "./firebase-service.js";

const app = document.querySelector("#app");
const page = document.body.dataset.page;

authReady(async user => {
  if (page === "login") {
    renderLogin();
    return;
  }

  if (!user) {
    go("index.html");
    return;
  }

  const profile = await getUserProfile(user.uid);
  if (!profile || profile.status === "inactive") {
    await logout();
    go("index.html");
    return;
  }

  if (!canOpenPage(profile.role, page)) {
    go(homeFor(profile.role));
    return;
  }

  renderDashboard(profile);
});

function renderLogin() {
  app.innerHTML = `
    <section class="login">
      <aside class="hero">
        <p class="campus">Southern Luzon State University - Lucena Campus</p>
        <h1 class="brand">OCRS</h1>
        <h2>Online Class Record &<br>Academic Monitoring System</h2>
        <p>Secure cloud access for students, faculty, and administrators.</p>
      </aside>
      <section class="login-panel">
        <form class="card login-card" id="loginForm">
          <h1>Sign In</h1>
          <p class="caption">Use your Firebase Authentication email and password.</p>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" autocomplete="username" placeholder="name@slsu.edu.ph" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" autocomplete="current-password" required>
          </div>
          <p class="error" id="loginError"></p>
          <button class="primary full">Sign In</button>
        </form>
      </section>
    </section>`;

  document.querySelector("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.querySelector("#loginError");
    error.textContent = "";
    try {
      const credential = await login(
        document.querySelector("#email").value.trim(),
        document.querySelector("#password").value
      );
      const profile = await getUserProfile(credential.user.uid);
      if (!profile) throw new Error("No user profile found in Firestore.");
      go(homeFor(profile.role));
    } catch (err) {
      error.textContent = friendlyError(err);
    }
  });
}

function renderDashboard(profile) {
  app.innerHTML = `
    <section class="layout">
      <aside class="sidebar">
        <div class="logo">
          <h2>OCRS</h2>
          <small>${escapeHtml(profile.fullName)}<br>${roleName(profile.role)} | ${escapeHtml(profile.program || profile.department || "SLSU")}</small>
        </div>
        ${menuFor(profile.role).map(item => `<a class="nav-button ${item.page === page ? "active" : ""}" href="${item.href}">${item.label}</a>`).join("")}
        <button class="nav-button logout" id="logoutBtn">Logout</button>
      </aside>
      <section class="page" id="pageRoot">
        <p class="caption">Loading secure records...</p>
      </section>
    </section>`;

  document.querySelector("#logoutBtn").addEventListener("click", async () => {
    await logout();
    go("index.html");
  });

  routePage(profile);
}

function routePage(profile) {
  if (page === "student-dashboard") studentDashboard(profile);
  if (page === "student-grades") studentGrades(profile);
  if (page === "student-standing") studentStanding(profile);
  if (page === "faculty-encode") facultyEncode(profile);
  if (page === "faculty-grades") facultyGrades(profile);
  if (page === "faculty-report") facultyReport(profile);
  if (page === "admin-summary") adminSummary(profile);
  if (page === "admin-users") adminUsers(profile);
  if (page === "admin-grades") adminGrades(profile);
}

function studentDashboard(profile) {
  const root = pageRoot();
  watchStudentGrades(profile.id, grades => {
    const finals = grades.filter(record => record.gradingPeriod === "Finals");
    const gpa = average(finals.map(record => record.finalGrade));
    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1>Student Dashboard</h1>
          <p class="caption">${escapeHtml(profile.program || "")} ${escapeHtml(profile.yearLevel || "")} ${escapeHtml(profile.section || "")}</p>
        </div>
      </header>
      ${summaryCards([
        ["Enrolled Subjects", unique(grades.map(record => record.subjectId)).length, "green"],
        ["Current GPA", gpa.toFixed(2), "gold"],
        ["Incomplete Records", grades.filter(record => record.status === "incomplete").length, "red"],
        ["Academic Standing", standing(gpa), "blue"]
      ])}
      <section class="panel">
        <h2>Subject Progress</h2>
        ${progressList(grades)}
      </section>
      <section class="panel">
        <h2>Recent Grades</h2>
        ${gradeTable(grades)}
      </section>`;
  });
}

function studentGrades(profile) {
  const root = pageRoot();
  watchStudentGrades(profile.id, grades => {
    root.innerHTML = `
      <header class="page-head">
        <h1>My Grades</h1>
        ${filters()}
      </header>
      ${gradeTable(applyFilters(grades))}`;
    bindFilterRefresh(() => studentGrades(profile));
  });
}

function studentStanding(profile) {
  const root = pageRoot();
  watchStudentGrades(profile.id, grades => {
    const finals = grades.filter(record => record.gradingPeriod === "Finals");
    const gpa = average(finals.map(record => record.finalGrade));
    root.innerHTML = `
      <h1>Academic Standing</h1>
      ${summaryCards([
        ["GPA", gpa.toFixed(2), "green"],
        ["Standing", standing(gpa), "gold"],
        ["Low Performance Warnings", finals.filter(record => record.finalGrade < 75).length, "red"],
        ["Completed Subjects", finals.filter(record => record.status === "complete").length, "blue"]
      ])}
      <section class="panel">
        <h2>Status Messages</h2>
        ${warningList(finals)}
      </section>`;
  });
}

function facultyEncode(profile) {
  const root = pageRoot();
  watchClassesForFaculty(profile.id, classes => {
    root.innerHTML = `
      <header class="page-head">
        <h1>Encode Class Record</h1>
        <p class="caption">Records can be edited only while the grade sheet is unlocked.</p>
      </header>
      <form class="panel" id="gradeForm">
        <div class="form-grid">
          <div class="field">
            <label>Assigned Class</label>
            <select id="classId" required>
              <option value="">Select class</option>
              ${classes.map(cls => `<option value="${cls.id}">${escapeHtml(cls.subjectName)} - ${escapeHtml(cls.sectionName)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Student UID</label><input id="studentId" required></div>
          <div class="field"><label>Student Name</label><input id="studentName" required></div>
          <div class="field"><label>Academic Year</label><input id="academicYear" value="2026-2027" required></div>
          <div class="field"><label>Semester</label><select id="semester" required><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></div>
          <div class="field"><label>Grading Period</label><select id="gradingPeriod" required><option>Midterm</option><option>Finals</option></select></div>
          <div class="field"><label>Attendance</label><input id="attendance" type="number" min="0" max="100" required></div>
          <div class="field"><label>Activities</label><input id="activities" type="number" min="0" max="100" required></div>
          <div class="field"><label>Quizzes</label><input id="quizzes" type="number" min="0" max="100" required></div>
          <div class="field"><label>Projects</label><input id="projects" type="number" min="0" max="100" required></div>
          <div class="field"><label>Major Exam</label><input id="exam" type="number" min="0" max="100" required></div>
        </div>
        <div class="actions">
          <button class="primary">Save Through Cloud Function</button>
          <span id="status" class="caption"></span>
        </div>
      </form>`;

    document.querySelector("#gradeForm").addEventListener("submit", async event => {
      event.preventDefault();
      const status = document.querySelector("#status");
      status.textContent = "Saving...";
      const selectedClass = classes.find(cls => cls.id === value("classId"));
      try {
        await createGradeRecord({
          classId: selectedClass.id,
          subjectId: selectedClass.subjectId,
          subjectName: selectedClass.subjectName,
          sectionId: selectedClass.sectionId,
          sectionName: selectedClass.sectionName,
          facultyId: profile.id,
          facultyName: profile.fullName,
          studentId: value("studentId"),
          studentName: value("studentName"),
          academicYear: value("academicYear"),
          semester: value("semester"),
          gradingPeriod: value("gradingPeriod"),
          components: {
            attendance: numberValue("attendance"),
            activities: numberValue("activities"),
            quizzes: numberValue("quizzes"),
            projects: numberValue("projects"),
            exam: numberValue("exam")
          },
          weights: {
            attendance: 10,
            activities: 20,
            quizzes: 20,
            projects: 20,
            exam: 30
          }
        });
        event.target.reset();
        status.textContent = "Record saved and calculated.";
        status.className = "success";
      } catch (err) {
        status.textContent = friendlyError(err);
        status.className = "error";
      }
    });
  });
}

function facultyGrades(profile) {
  const root = pageRoot();
  watchAssignedGrades(profile.id, grades => {
    root.innerHTML = `
      <header class="page-head">
        <h1>Assigned Grade Records</h1>
        ${filters()}
      </header>
      ${gradeTable(applyFilters(grades), true)}`;
    bindGradeActions();
    bindFilterRefresh(() => facultyGrades(profile));
  });
}

function facultyReport(profile) {
  const root = pageRoot();
  watchAssignedGrades(profile.id, grades => {
    root.innerHTML = `
      <header class="page-head">
        <h1>Reports</h1>
        <button class="secondary" id="exportBtn">Generate CSV Report</button>
      </header>
      ${summaryCards([
        ["Assigned Records", grades.length, "green"],
        ["Complete", grades.filter(record => record.status === "complete").length, "blue"],
        ["Incomplete", grades.filter(record => record.status === "incomplete").length, "red"],
        ["Average Grade", average(grades.map(record => record.finalGrade)).toFixed(2), "gold"]
      ])}
      ${gradeTable(grades)}`;
    document.querySelector("#exportBtn").addEventListener("click", () => downloadCsv(grades, "faculty-grade-report.csv"));
  });
}

function adminSummary() {
  const root = pageRoot();
  watchAllGrades(grades => {
    watchUsers(users => {
      const students = users.filter(user => user.role === "student");
      const faculty = users.filter(user => user.role === "faculty");
      root.innerHTML = `
        <header class="page-head">
          <h1>Institution Summary</h1>
          <p class="caption">Real-time academic monitoring overview.</p>
        </header>
        ${summaryCards([
          ["Students", students.length, "green"],
          ["Faculty", faculty.length, "blue"],
          ["Grade Records", grades.length, "gold"],
          ["Incomplete Records", grades.filter(record => record.status === "incomplete").length, "red"]
        ])}
        <section class="panel">
          <h2>Students Needing Academic Support</h2>
          ${gradeTable(grades.filter(record => record.finalGrade < 75))}
        </section>`;
    });
  });
}

function adminUsers() {
  const root = pageRoot();
  watchUsers(users => {
    root.innerHTML = `
      <header class="page-head">
        <h1>User Management</h1>
        <p class="caption">Create accounts in Firebase Authentication, then maintain role profiles here.</p>
      </header>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Program/Department</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td>${escapeHtml(user.fullName)}</td>
                <td>${escapeHtml(user.email || "")}</td>
                <td>${roleName(user.role)}</td>
                <td>${escapeHtml(user.program || user.department || "")}</td>
                <td>${escapeHtml(user.status || "active")}</td>
                <td><button class="secondary js-status" data-id="${user.id}" data-status="${user.status === "inactive" ? "active" : "inactive"}">${user.status === "inactive" ? "Activate" : "Deactivate"}</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    document.querySelectorAll(".js-status").forEach(button => {
      button.addEventListener("click", () => updateUserStatus(button.dataset.id, button.dataset.status));
    });
  });
}

function adminGrades() {
  const root = pageRoot();
  watchAllGrades(async grades => {
    const logs = await getRecentAuditLogs();
    root.innerHTML = `
      <header class="page-head">
        <h1>Grade Records & Audit Logs</h1>
        <button class="secondary" id="exportBtn">Export Institution Report</button>
      </header>
      ${gradeTable(grades, true)}
      <section class="panel">
        <h2>Recent Audit Logs</h2>
        ${auditTable(logs)}
      </section>`;
    bindGradeActions();
    document.querySelector("#exportBtn").addEventListener("click", async () => {
      try {
        await exportReport("institution-overview", {});
        downloadCsv(grades, "institution-grade-report.csv");
      } catch {
        downloadCsv(grades, "institution-grade-report.csv");
      }
    });
  });
}

function gradeTable(grades, withActions = false) {
  if (!grades.length) return `<p class="empty">No records found.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Student</th><th>Subject</th><th>Class</th><th>Year</th><th>Semester</th><th>Period</th><th>Final</th><th>GPA</th><th>Status</th>${withActions ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${grades.map(record => `
            <tr>
              <td>${escapeHtml(record.studentName || record.studentId)}</td>
              <td>${escapeHtml(record.subjectName || "")}</td>
              <td>${escapeHtml(record.sectionName || "")}</td>
              <td>${escapeHtml(record.academicYear || "")}</td>
              <td>${escapeHtml(record.semester || "")}</td>
              <td>${escapeHtml(record.gradingPeriod || "")}</td>
              <td>${formatNumber(record.finalGrade)}</td>
              <td>${formatNumber(record.gpa)}</td>
              <td><span class="${record.finalGrade >= 75 ? "passed" : "failed"}">${escapeHtml(record.status || record.remarks || "")}</span></td>
              ${withActions ? `<td>${record.locked ? `<button class="secondary js-unlock" data-id="${record.id}">Unlock</button>` : `<button class="danger js-lock" data-id="${record.id}">Lock</button>`}</td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function auditTable(logs) {
  if (!logs.length) return `<p class="empty">No audit entries yet.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>${logs.map(log => `<tr><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.actorName || log.actorId || "")}</td><td>${escapeHtml(log.targetId || "")}</td><td>${escapeHtml(log.details || "")}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function summaryCards(items) {
  return `<section class="grid">${items.map(([label, value, color]) => `<div class="stat ${color}"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`).join("")}</section>`;
}

function progressList(records) {
  const finals = records.filter(record => record.gradingPeriod === "Finals");
  if (!finals.length) return `<p class="empty">No final records yet.</p>`;
  return finals.map(record => `
    <div class="progress-row">
      <span>${escapeHtml(record.subjectName)}</span>
      <progress max="100" value="${Number(record.finalGrade || 0)}"></progress>
      <strong>${formatNumber(record.finalGrade)}</strong>
    </div>`).join("");
}

function warningList(records) {
  const warnings = records.filter(record => record.finalGrade < 75 || record.status === "incomplete");
  if (!warnings.length) return `<p class="success">No academic warnings at this time.</p>`;
  return `<ul class="warnings">${warnings.map(record => `<li>${escapeHtml(record.subjectName)} needs attention: ${formatNumber(record.finalGrade)} (${escapeHtml(record.status || "review")}).</li>`).join("")}</ul>`;
}

function filters() {
  return `
    <div class="filters">
      <input id="filterSearch" placeholder="Search student, subject, or section" value="${escapeHtml(localStorage.getItem("filterSearch") || "")}">
      <select id="filterPeriod">
        <option value="">All periods</option>
        <option ${selected("Midterm")}>Midterm</option>
        <option ${selected("Finals")}>Finals</option>
      </select>
    </div>`;
}

function selected(value) {
  return localStorage.getItem("filterPeriod") === value ? "selected" : "";
}

function bindFilterRefresh(refresh) {
  const search = document.querySelector("#filterSearch");
  const period = document.querySelector("#filterPeriod");
  if (search) search.addEventListener("input", () => {
    localStorage.setItem("filterSearch", search.value);
    refresh();
  });
  if (period) period.addEventListener("change", () => {
    localStorage.setItem("filterPeriod", period.value);
    refresh();
  });
}

function applyFilters(records) {
  const search = (localStorage.getItem("filterSearch") || "").toLowerCase();
  const period = localStorage.getItem("filterPeriod") || "";
  return records.filter(record => {
    const haystack = `${record.studentName || ""} ${record.subjectName || ""} ${record.sectionName || ""}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!period || record.gradingPeriod === period);
  });
}

function bindGradeActions() {
  document.querySelectorAll(".js-lock").forEach(button => {
    button.addEventListener("click", () => lockGradeRecord(button.dataset.id));
  });
  document.querySelectorAll(".js-unlock").forEach(button => {
    button.addEventListener("click", () => {
      const reason = prompt("Reason for unlocking this record:");
      if (reason) unlockGradeRecord(button.dataset.id, reason);
    });
  });
}

function downloadCsv(records, filename) {
  const headers = ["studentName", "subjectName", "sectionName", "academicYear", "semester", "gradingPeriod", "finalGrade", "gpa", "status"];
  const rows = records.map(record => headers.map(header => `"${String(record[header] ?? "").replaceAll('"', '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function canOpenPage(role, route) {
  return menuFor(role).some(item => item.page === route);
}

function menuFor(role) {
  if (role === "admin") {
    return [
      { page: "admin-summary", href: "admin-summary.html", label: "Institution Summary" },
      { page: "admin-users", href: "admin-users.html", label: "User Management" },
      { page: "admin-grades", href: "admin-grades.html", label: "Records & Audit Logs" }
    ];
  }
  if (role === "faculty") {
    return [
      { page: "faculty-encode", href: "faculty-encode.html", label: "Encode Grades" },
      { page: "faculty-grades", href: "faculty-grades.html", label: "Grade Records" },
      { page: "faculty-report", href: "faculty-report.html", label: "Reports" }
    ];
  }
  return [
    { page: "student-dashboard", href: "student-dashboard.html", label: "Dashboard" },
    { page: "student-grades", href: "student-grades.html", label: "My Grades" },
    { page: "student-standing", href: "student-standing.html", label: "Academic Standing" }
  ];
}

function homeFor(role) {
  if (role === "admin") return "admin-summary.html";
  if (role === "faculty") return "faculty-encode.html";
  return "student-dashboard.html";
}

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function numberValue(id) {
  return Number(value(id));
}

function average(values) {
  const nums = values.map(Number).filter(value => !Number.isNaN(value));
  if (!nums.length) return 0;
  return nums.reduce((total, value) => total + value, 0) / nums.length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function standing(gpa) {
  if (gpa >= 90) return "Highest Honors";
  if (gpa >= 85) return "High Honors";
  if (gpa >= 80) return "Honors";
  if (gpa >= 75) return "Satisfactory";
  return "Needs Support";
}

function roleName(role) {
  if (role === "admin") return "Administrator";
  if (role === "faculty") return "Faculty";
  return "Student";
}

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toFixed(2);
}

function pageRoot() {
  return document.querySelector("#pageRoot");
}

function go(path) {
  window.location.href = path;
}

function friendlyError(err) {
  return err.message ? err.message.replace("Firebase: ", "") : "The request could not be completed.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

