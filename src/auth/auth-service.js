import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase-config.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.unsubscribe = null;
  }

  /**
   * Initialize authentication state listener
   */
  initAuthListener(callback) {
    this.unsubscribe = onAuthStateChanged(auth, async (user) => {
      this.currentUser = user;
      if (user) {
        // Fetch user role from Firestore
        const userDoc = await this.getUserRole(user.uid);
        this.userRole = userDoc ? userDoc.role : null;
      } else {
        this.userRole = null;
      }
      callback(user, this.userRole);
    });
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user role from Firestore
      const userDoc = await this.getUserRole(user.uid);
      this.currentUser = user;
      this.userRole = userDoc ? userDoc.role : null;

      return { success: true, user, role: this.userRole };
    } catch (error) {
      console.error('Login error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await signOut(auth);
      this.currentUser = null;
      this.userRole = null;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user role from Firestore
   */
  async getUserRole(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return userSnap.data();
      }
      return null;
    } catch (error) {
      console.error('Error fetching user role:', error.message);
      return null;
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Get current user role
   */
  getUserRoleSync() {
    return this.userRole;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.currentUser !== null;
  }

  /**
   * Check if user is a student
   */
  isStudent() {
    return this.userRole === 'student';
  }

  /**
   * Check if user is faculty
   */
  isFaculty() {
    return this.userRole === 'faculty';
  }

  /**
   * Check if user is admin
   */
  isAdmin() {
    return this.userRole === 'admin';
  }

  /**
   * Cleanup auth listener
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

export default new AuthService();
