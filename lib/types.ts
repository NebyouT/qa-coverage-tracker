export type Band = { name: string; from: number };
export type Department = { code: string; name: string };
export type Period = { academicYear: string; semester: string; reportType: string };

/** A yes/no question asked to both teachers and students for every course. */
export type Question = {
  key: string;
  /** Wording for teachers, e.g. "Have you given a quiz?" */
  teacher: string;
  /** Wording for students, e.g. "Have you taken a quiz?" */
  student: string;
  /** Only asked for courses with a lab */
  labOnly?: boolean;
};

/** key -> 'yes' | 'no' */
export type Answers = Record<string, 'yes' | 'no'>;

export type Settings = {
  /** Yes/no questions asked for every course (same for teachers and students) */
  questions: Question[];
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
  /** Teaching weeks in a semester: default "total lab sessions" for a course with a lab (one session a week). */
  weeksPerSemester: number;
  /** Lab sessions of difference between a course's lab sections that raises a flag. */
  labGapThreshold: number;
  teachersOpen: boolean;
  studentsOpen: boolean;
};

/** source: 'admin' | 'import' | 'teacher' (the teacher added their own name; not approved yet) */
export type Teacher = { id: number; name: string; department: string; active: boolean; source: string };

export type Course = {
  id: number;
  academic_year: string;
  semester: string;
  /** Department (QA team) that offers the course */
  department: string;
  /** Department of the students taking it (e.g. IE for a course SE teaches to IE). Empty = same as department. */
  student_dept: string;
  /** Section of that class, e.g. "Sec 1" (empty when there is one class) */
  section: string;
  year_of_study: number;
  batch: string;
  /** Optional: the course offering file has titles only */
  code: string;
  name: string;
  crhr: number | null;
  total_chapters: number | null;
  has_lab: boolean;
  /** Expected lab sessions per lab section for the semester */
  total_lab_sessions: number | null;
  students: number | null;
  /** Weekly contact hours from the course offering (null = unknown) */
  lec_hours: number | null;
  lab_hours: number | null;
  tut_hours: number | null;
  lec_sections: number | null;
  lab_sections: number | null;
  tut_sections: number | null;
  /** "Sem.r" column of the offering (semester of the course in the curriculum) */
  curriculum_semester: string;
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
  student_dept: string;
  section: string;
  year_of_study: number | null;
  batch: string;
  course_code: string;
  course_name: string;
  crhr: number | null;
  total_chapters: number | null;
  chapters_covered: number | null;
  has_lab: boolean;
  total_lab_sessions: number | null;
  /** Average over lab sections when there is more than one */
  labs_covered: number | null;
  /** Labs done per lab section, e.g. "8|6" (empty for one section) */
  labs_by_section: string;
  tutorials_done: number | null;
  /** JSON of Answers */
  answers: string;
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
  /** Which lab section the student is in (1, 2, …) when the course has several */
  lab_section: number | null;
  /** JSON of Answers */
  answers: string;
  comment: string;
  review: Review;
  device: string;
};

export type PublicTeacher = { id: number; name: string; department: string };
