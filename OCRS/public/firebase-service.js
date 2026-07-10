import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

export function authReady(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchUserProfile(uid, callback) {
  return onSnapshot(doc(db, "users", uid), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function watchStudentGrades(uid, callback) {
  const q = query(collection(db, "gradeRecords"), where("studentId", "==", uid), orderBy("subjectName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchAssignedGrades(facultyId, callback) {
  const q = query(collection(db, "gradeRecords"), where("facultyId", "==", facultyId), orderBy("studentName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchAllGrades(callback) {
  const q = query(collection(db, "gradeRecords"), orderBy("studentName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchUsers(callback) {
  const q = query(collection(db, "users"), orderBy("role"), orderBy("fullName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchClassesForFaculty(facultyId, callback) {
  const q = query(collection(db, "classes"), where("facultyIds", "array-contains", facultyId), orderBy("subjectName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchEnrollmentsForStudent(studentId, callback) {
  const q = query(collection(db, "enrollments"), where("studentId", "==", studentId), orderBy("subjectName"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export function watchAcademicCollection(collectionName, callback) {
  const q = query(collection(db, collectionName), orderBy("name"));
  return onSnapshot(q, snap => callback(snap.docs.map(toData)));
}

export async function createGradeRecord(record) {
  const calculateGrade = httpsCallable(functions, "calculateGradeRecord");
  const result = await calculateGrade(record);
  return result.data;
}

export async function lockGradeRecord(recordId) {
  const lockRecord = httpsCallable(functions, "lockGradeRecord");
  return lockRecord({ recordId });
}

export async function unlockGradeRecord(recordId, reason) {
  const unlockRecord = httpsCallable(functions, "unlockGradeRecord");
  return unlockRecord({ recordId, reason });
}

export async function exportReport(reportType, filters) {
  const generateReport = httpsCallable(functions, "generateReport");
  return generateReport({ reportType, filters });
}

export async function saveAttendance(record) {
  return addDoc(collection(db, "attendanceRecords"), {
    ...record,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateUserStatus(userId, status) {
  return updateDoc(doc(db, "users", userId), {
    status,
    updatedAt: serverTimestamp()
  });
}

export async function upsertAcademicDocument(collectionName, id, data) {
  return setDoc(doc(db, collectionName, id), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getRecentAuditLogs() {
  const q = query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(toData);
}

function toData(snap) {
  return { id: snap.id, ...snap.data() };
}
