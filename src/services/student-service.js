import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';

class StudentService {
  /**
   * Get student profile information
   */
  async getStudentProfile(studentId) {
    try {
      const userRef = doc(db, 'users', studentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return { success: true, data: userSnap.data() };
      }
      return { success: false, error: 'Student profile not found' };
    } catch (error) {
      console.error('Error fetching student profile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get student's enrolled classes
   */
  async getEnrolledClasses(studentId) {
    try {
      const enrollmentsRef = collection(db, 'enrollments');
      const q = query(enrollmentsRef, where('studentId', '==', studentId));
      const querySnapshot = await getDocs(q);
      
      const classes = [];
      for (const doc of querySnapshot.docs) {
        classes.push({
          id: doc.id,
          ...doc.data()
        });
      }
      return { success: true, data: classes };
    } catch (error) {
      console.error('Error fetching enrolled classes:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get grade records for student
   */
  async getGradeRecords(studentId, filters = {}) {
    try {
      let q = query(
        collection(db, 'gradeRecords'),
        where('studentId', '==', studentId)
      );

      // Apply optional filters
      if (filters.classId) {
        q = query(
          collection(db, 'gradeRecords'),
          where('studentId', '==', studentId),
          where('classId', '==', filters.classId)
        );
      }

      const querySnapshot = await getDocs(q);
      const grades = [];
      
      for (const doc of querySnapshot.docs) {
        grades.push({
          id: doc.id,
          ...doc.data()
        });
      }

      return { success: true, data: grades };
    } catch (error) {
      console.error('Error fetching grade records:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get attendance records for student
   */
  async getAttendanceRecords(studentId, classId = null) {
    try {
      let q;
      if (classId) {
        q = query(
          collection(db, 'attendanceRecords'),
          where('studentId', '==', studentId),
          where('classId', '==', classId)
        );
      } else {
        q = query(
          collection(db, 'attendanceRecords'),
          where('studentId', '==', studentId)
        );
      }

      const querySnapshot = await getDocs(q);
      const attendance = [];
      
      for (const doc of querySnapshot.docs) {
        attendance.push({
          id: doc.id,
          ...doc.data()
        });
      }

      return { success: true, data: attendance };
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get GPA calculation for student
   */
  async getGPA(studentId) {
    try {
      const gpaRef = doc(db, 'gpaCalculations', studentId);
      const gpaSnap = await getDoc(gpaRef);
      
      if (gpaSnap.exists()) {
        return { success: true, data: gpaSnap.data() };
      }
      return { success: false, error: 'GPA data not found' };
    } catch (error) {
      console.error('Error fetching GPA:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get subject performance summary for student
   */
  async getSubjectPerformance(studentId) {
    try {
      const grades = await this.getGradeRecords(studentId);
      if (!grades.success) {
        return grades;
      }

      const performanceMap = {};
      grades.data.forEach(grade => {
        if (!performanceMap[grade.subjectId]) {
          performanceMap[grade.subjectId] = {
            subjectId: grade.subjectId,
            subjectCode: grade.subjectCode,
            subjectName: grade.subjectName,
            grades: [],
            finalGrade: grade.finalGrade || 0,
            status: grade.status || 'Incomplete'
          };
        }
        performanceMap[grade.subjectId].grades.push(grade);
      });

      return { success: true, data: Object.values(performanceMap) };
    } catch (error) {
      console.error('Error calculating subject performance:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate academic standing based on GPA
   */
  calculateAcademicStanding(gpa) {
    if (gpa >= 3.5) return 'Excellent';
    if (gpa >= 3.0) return 'Very Good';
    if (gpa >= 2.5) return 'Good';
    if (gpa >= 2.0) return 'Satisfactory';
    if (gpa >= 1.5) return 'Probation';
    return 'Failed';
  }

  /**
   * Get warnings or alerts for student
   */
  async getAcademicAlerts(studentId) {
    try {
      const gpa = await this.getGPA(studentId);
      const performance = await this.getSubjectPerformance(studentId);
      
      const alerts = [];

      if (gpa.success) {
        const standing = this.calculateAcademicStanding(gpa.data.gpa || 0);
        if (standing === 'Probation' || standing === 'Failed') {
          alerts.push({
            type: 'warning',
            message: `Academic standing: ${standing}. GPA is ${gpa.data.gpa || 0}`
          });
        }
      }

      if (performance.success) {
        performance.data.forEach(subject => {
          if (subject.finalGrade < 2.0 && subject.status !== 'Incomplete') {
            alerts.push({
              type: 'warning',
              message: `Low grade in ${subject.subjectName}: ${subject.finalGrade}`
            });
          }
          if (subject.status === 'Incomplete') {
            alerts.push({
              type: 'info',
              message: `Incomplete grades in ${subject.subjectName}`
            });
          }
        });
      }

      return { success: true, data: alerts };
    } catch (error) {
      console.error('Error fetching academic alerts:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new StudentService();
