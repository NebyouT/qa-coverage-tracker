export type Band = { name: string; from: number };
export type Department = { code: string; name: string };
export type Period = { academicYear: string; semester: string; reportType: string };

export type Settings = {
  schoolName: string;
  departments: Department[];
  years: number[];
  semesters: string[];
  reportTypes: string[];
  /** Weight of lecture coverage when the course has a lab (lab weight = 1 - this). */
  lectureWeight: number;
  midBands: Band[];
  finalBands: Band[];
  /** The period teachers and students currently report for. */
  period: Period;
  /** Quick-note chips teachers can tap instead of typing remarks. */
  tags: string[];
  /** Chapters of difference between teacher and students' median that raises a flag. */
  gapThreshold: number;
  teachersOpen: boolean;
  studentsOpen: boolean;
};

export type Teacher = { id: number; name: string; department: string; active: boolean };

export type Course = {
  id: number;
  academic_year: string;
  semester: string;
  department: string;
  year_of_study: number;
  batch: string;
  code: string;
  name: string;
  crhr: number | null;
  total_chapters: number | null;
  has_lab: boolean;
  total_lab_sessions: number | null;
  /** 'admin' | 'import' | 'teacher' (added by a teacher, not yet approved) */
  source: string;
  teacher_ids: number[];
};

export type Review = 'pending' | 'verified' | 'rejected';

export type TeacherReport = {
  id: number;
  created_at: string;
  academic_year: string;
  semester: string;
  report_type: string;
  teacher_id: number | null;
  teacher_name: string;
  course_id: number | null;
  department: string;
  year_of_study: number | null;
  batch: string;
  course_code: string;
  course_name: string;
  crhr: number | null;
  total_chapters: number | null;
  chapters_covered: number | null;
  has_lab: boolean;
  total_lab_sessions: number | null;
  labs_covered: number | null;
  tags: string;
  remarks: string;
  review: Review;
  device: string;
};

export type StudentReport = {
  id: number;
  created_at: string;
  submission: string;
  academic_year: string;
  semester: string;
  report_type: string;
  student_name: string;
  department: string;
  year_of_study: number | null;
  course_id: number | null;
  course_code: string;
  course_name: string;
  chapters_covered: number | null;
  labs_covered: number | null;
  comment: string;
  review: Review;
  device: string;
};

export type PublicTeacher = { id: number; name: string; department: string };
