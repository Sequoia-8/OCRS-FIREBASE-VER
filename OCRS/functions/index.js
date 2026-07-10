const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

exports.calculateGradeRecord = onCall(async request => {
  const actor = await requireRole(request, ["faculty"]);
  const data = request.data || {};

  await assertAssignedFaculty(actor.uid, data.classId);
  await assertUnlockedClass(data.classId);

  const finalGrade = computeWeightedGrade(data.components, data.weights);
  const gpa = gradeToGpa(finalGrade);
  const status = hasIncomplete(data.components) ? "incomplete" : "complete";

  const payload = {
    classId: data.classId,
    subjectId: data.subjectId,
    subjectName: data.subjectName,
    sectionId: data.sectionId,
    sectionName: data.sectionName,
    facultyId: actor.uid,
    facultyName: data.facultyName || actor.profile.fullName,
    studentId: data.studentId,
    studentName: data.studentName,
    academicYear: data.academicYear,
    semester: data.semester,
    gradingPeriod: data.gradingPeriod,
    components: data.components,
    weights: data.weights,
    finalGrade,
    gpa,
    status,
    locked: false,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  };

  const recordRef = await db.collection("gradeRecords").add(payload);
  await audit(actor, "create-grade-record", recordRef.id, `Encoded ${payload.subjectName} for ${payload.studentName}`);

  return { id: recordRef.id, finalGrade, gpa, status };
});

exports.lockGradeRecord = onCall(async request => {
  const actor = await requireRole(request, ["faculty", "admin"]);
  const recordRef = db.collection("gradeRecords").doc(request.data.recordId);
  const record = await getRequired(recordRef, "Grade record not found.");

  if (actor.profile.role === "faculty") {
    await assertAssignedFaculty(actor.uid, record.classId);
  }

  await recordRef.update({
    locked: true,
    lockedBy: actor.uid,
    lockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  await audit(actor, "lock-grade-record", recordRef.id, "Locked grade record.");

  return { ok: true };
});

exports.unlockGradeRecord = onCall(async request => {
  const actor = await requireRole(request, ["admin"]);
  const recordRef = db.collection("gradeRecords").doc(request.data.recordId);
  await getRequired(recordRef, "Grade record not found.");

  await recordRef.update({
    locked: false,
    unlockedBy: actor.uid,
    unlockReason: String(request.data.reason || "No reason provided."),
    unlockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  await audit(actor, "unlock-grade-record", recordRef.id, String(request.data.reason || ""));

  return { ok: true };
});

exports.generateReport = onCall(async request => {
  const actor = await requireRole(request, ["faculty", "admin"]);
  const reportRef = await db.collection("reports").add({
    reportType: request.data.reportType,
    filters: request.data.filters || {},
    ownerId: actor.uid,
    ownerRole: actor.profile.role,
    status: "generated",
    createdAt: FieldValue.serverTimestamp()
  });
  await audit(actor, "generate-report", reportRef.id, `Generated ${request.data.reportType}`);

  return { id: reportRef.id };
});

exports.createUserProfile = onCall(async request => {
  const actor = await requireRole(request, ["admin"]);
  const data = request.data || {};

  const userRecord = await getAuth().createUser({
    email: data.email,
    displayName: data.fullName,
    disabled: data.status === "inactive"
  });

  await db.collection("users").doc(userRecord.uid).set({
    fullName: data.fullName,
    email: data.email,
    studentNumber: data.studentNumber || "",
    employeeNumber: data.employeeNumber || "",
    role: data.role,
    program: data.program || "",
    yearLevel: data.yearLevel || "",
    section: data.section || "",
    department: data.department || "",
    status: data.status || "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await audit(actor, "create-user-profile", userRecord.uid, `Created ${data.role} account.`);
  return { uid: userRecord.uid };
});

async function requireRole(request, roles) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }

  const uid = request.auth.uid;
  const profile = await getRequired(db.collection("users").doc(uid), "User profile not found.");

  if (profile.status !== "active") {
    throw new HttpsError("permission-denied", "Account is inactive.");
  }

  if (!roles.includes(profile.role)) {
    throw new HttpsError("permission-denied", "You do not have permission for this action.");
  }

  return { uid, profile };
}

async function assertAssignedFaculty(uid, classId) {
  const classData = await getRequired(db.collection("classes").doc(classId), "Class not found.");
  if (!Array.isArray(classData.facultyIds) || !classData.facultyIds.includes(uid)) {
    throw new HttpsError("permission-denied", "Faculty is not assigned to this class.");
  }
}

async function assertUnlockedClass(classId) {
  const classData = await getRequired(db.collection("classes").doc(classId), "Class not found.");
  if (classData.locked === true) {
    throw new HttpsError("failed-precondition", "This class record is locked.");
  }
}

async function getRequired(ref, message) {
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", message);
  return snap.data();
}

function computeWeightedGrade(components = {}, weights = {}) {
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  if (totalWeight <= 0) throw new HttpsError("invalid-argument", "Grading weights are required.");

  const score = Object.keys(weights).reduce((sum, key) => {
    const component = Number(components[key] || 0);
    const weight = Number(weights[key] || 0);
    if (component < 0 || component > 100) {
      throw new HttpsError("invalid-argument", `${key} score must be between 0 and 100.`);
    }
    return sum + (component * weight);
  }, 0) / totalWeight;

  return Math.round(score * 100) / 100;
}

function hasIncomplete(components = {}) {
  return Object.values(components).some(value => value === "" || value === null || value === undefined);
}

function gradeToGpa(grade) {
  if (grade >= 97) return 1.0;
  if (grade >= 94) return 1.25;
  if (grade >= 91) return 1.5;
  if (grade >= 88) return 1.75;
  if (grade >= 85) return 2.0;
  if (grade >= 82) return 2.25;
  if (grade >= 79) return 2.5;
  if (grade >= 76) return 2.75;
  if (grade >= 75) return 3.0;
  return 5.0;
}

async function audit(actor, action, targetId, details) {
  await db.collection("auditLogs").add({
    action,
    actorId: actor.uid,
    actorName: actor.profile.fullName || "",
    actorRole: actor.profile.role,
    targetId,
    details,
    createdAt: FieldValue.serverTimestamp()
  });
}

