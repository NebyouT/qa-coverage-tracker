import { courseKey, nameKey } from './normalize';

/**
 * Built-in course list for 2019 E.C. Semester I, so the teacher and student pages are never empty.
 * Loaded automatically into a new database, and again from Admin → Courses → "Load built-in list".
 * Existing courses are matched (by code or title + class) and left as they are.
 *
 * SE: "SE - 2019 E.C SEM - I Course Offering.xlsx"
 * IT: 2019 E.C. Semester I rows of QA_Course_Coverage_Report final.xlsx
 */
export const SEED_PERIOD = { academicYear: '2019 E.C.', semester: 'Semester I' };

type SeedCourse = {
  dept: string;
  teacher?: string;
  name: string;
  code?: string;
  /** Students' department when it is not `dept`, e.g. IE */
  cls?: string;
  section?: string;
  year: number;
  batch?: string;
  students?: number;
  crhr: number;
  /** weekly hours: lecture, lab, tutorial */
  hrs?: [number, number, number];
  /** sections: lecture, lab, tutorial */
  secs?: [number, number, number];
  sem?: string;
  chapters?: number;
  /** total lab sessions when known (otherwise teaching weeks are used for lab courses) */
  labs?: number;
  lab?: boolean;
};

export const SEED_COURSES: SeedCourse[] = [
  // ---- SE course offering ----
  { dept: 'SE', teacher: 'Abrahim A.', name: 'Design and Analysis of Algorithm', year: 3, students: 45, crhr: 3, hrs: [2, 3, 1], secs: [1, 2, 1], sem: 'I' },
  { dept: 'SE', teacher: 'Abrahim A.', name: 'Introduction to AI', year: 4, students: 52, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Berihun C.', name: 'Software Project Management', year: 4, students: 52, crhr: 3, hrs: [2, 0, 3], secs: [1, 0, 1], sem: 'II' },
  { dept: 'SE', teacher: 'Berihun C.', name: 'Fundamentals of Programming II', cls: 'IE', section: 'Sec 1', year: 3, students: 35, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Elsay M.', name: 'Software Engineering Tools and Practice', year: 3, students: 45, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Elsay M.', name: 'Distributed Database Man. System (Elective II)', year: 5, students: 57, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Fikadu W.', name: 'Advanced Database System', year: 3, students: 45, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Fikadu W.', name: 'Software Testing and Quality Assurance', year: 4, students: 52, crhr: 3, hrs: [3, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Natnael F.', name: 'Principles of Compiler Design', year: 4, students: 52, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Natnael F.', name: 'Fundamentals of Programming II', cls: 'IE', section: 'Sec 2', year: 3, students: 35, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Sinodos G.', name: 'Object Oriented Programming', year: 3, students: 45, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Sinodos G.', name: 'Internship', year: 4, students: 46, crhr: 3, hrs: [0, 0, 3], secs: [0, 0, 1], sem: 'I' },
  { dept: 'SE', teacher: 'Mety M.', name: 'Fundamentals of Software Engineering', year: 2, students: 40, crhr: 3, hrs: [3, 0, 3], secs: [1, 0, 1], sem: 'I' },
  { dept: 'SE', teacher: 'Mety M.', name: 'Software Requirement Engineering', year: 3, students: 45, crhr: 3, hrs: [3, 0, 3], secs: [1, 0, 1], sem: 'I' },
  { dept: 'SE', teacher: 'Shimels H.', name: 'Data communication and Computer Network', year: 3, students: 45, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Shimels H.', name: 'Human Computer Interaction', year: 5, students: 57, crhr: 2, hrs: [2, 0, 3], secs: [1, 0, 1], sem: 'II' },
  { dept: 'SE', teacher: 'Nebyu T.', name: 'Fundamentals of Programming II', year: 2, students: 40, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Nebyu T.', name: 'Computer Graphics', year: 5, students: 57, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Sisay N.', name: 'Computer Simulation and Modeling', year: 5, students: 57, crhr: 3, hrs: [2, 3, 0], secs: [1, 2, 0], sem: 'II' },
  { dept: 'SE', teacher: 'Sisay N.', name: 'Recent Topics in SE', year: 4, students: 52, crhr: 3, hrs: [2, 0, 1], secs: [1, 0, 1], sem: 'II' },
  { dept: 'SE', teacher: 'Yahya A.', name: 'Computer Organization and Architecture', year: 3, students: 45, crhr: 3, hrs: [3, 0, 0], secs: [1, 0, 0], sem: 'I' },
  { dept: 'SE', teacher: 'Yahya A.', name: 'Python programming', cls: 'IE', year: 4, students: 35, crhr: 3, hrs: [2, 3, 0], secs: [2, 2, 0], sem: 'II' },

  // ---- IT (from the QA workbook) ----
  { dept: 'IT', name: 'Database Systems', code: 'ITec 3041', year: 4, batch: '2016', crhr: 5, chapters: 10, lab: true, labs: 8 },
  { dept: 'IT', name: 'Basic Research Method in IT', code: 'ITec4155', year: 4, batch: '2016', crhr: 5, chapters: 7, lab: false },
  { dept: 'IT', name: 'Information Storage and Retrieval', code: 'ITec 3082', year: 4, batch: '2016', crhr: 5, chapters: 8, lab: true, labs: 4 },
  { dept: 'IT', name: 'Wireless Networking', code: 'ITec 4101', year: 4, batch: '2016', crhr: 5, chapters: 7, lab: true, labs: 5 },
  { dept: 'IT', name: 'Network Design', code: 'ITec 4111', year: 4, batch: '2016', crhr: 5, chapters: 7, lab: true, labs: 6 },
  { dept: 'IT', name: 'Seminar on Current Trends in IT', code: 'ITec 4131', year: 4, batch: '2016', crhr: 1, chapters: 4, lab: false },
  { dept: 'IT', name: 'Computer Maintenance and Technical Support', code: 'ITec 3032', year: 4, batch: '2016', crhr: 5, chapters: 7, lab: true, labs: 8 },
  { dept: 'IT', name: 'Internet Programming II', code: 'ITec3093', year: 3, batch: '2018', crhr: 5, chapters: 5, lab: true, labs: 16 },
  { dept: 'IT', name: 'Telecommunication', code: 'ITec3101', year: 3, batch: '2018', crhr: 3, chapters: 5, lab: false },
  { dept: 'IT', name: 'Advanced Database System', code: 'ITec3071', year: 3, batch: '2018', crhr: 5, chapters: 5, lab: true, labs: 8 },
  { dept: 'IT', name: 'Object Oriented Programming in Java', code: 'ITec3051', year: 3, batch: '2018', crhr: 5, chapters: 5, lab: true, labs: 16 },
  { dept: 'IT', name: 'System Analysis and Design', code: 'ITec3061', year: 3, batch: '2018', crhr: 6, chapters: 9, lab: true, labs: 6 },
  { dept: 'IT', name: 'Multimedia Systems', code: 'ITec3121', year: 3, batch: '2018', crhr: 5, chapters: 5, lab: true, labs: 6 },
];

type Q = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

/** Same title, allowing a few stray letters at the end (e.g. "…ArchitectureOA" in the offering file). */
function similarTitle(a: string, b: string) {
  const x = courseKey('', a);
  const y = courseKey('', b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 12 && long.startsWith(short) && long.length - short.length <= 3;
}

/** Adds the built-in lecturers and courses that are missing. Returns how many were added. */
export async function seedCourses(q: Q, weeks = 16): Promise<{ courses: number; teachers: number }> {
  const { academicYear, semester } = SEED_PERIOD;
  const teachers = await q(`select id, name from teachers`);
  const teacherId = new Map(teachers.map((t) => [nameKey(t.name), Number(t.id)]));
  const existing = await q(`select id, department, student_dept, section, code, name, batch from courses where academic_year = $1 and semester = $2`, [
    academicYear,
    semester,
  ]);
  let addedCourses = 0;
  let addedTeachers = 0;

  for (const c of SEED_COURSES) {
    const studentDept = c.cls && c.cls !== c.dept ? c.cls : '';
    const key = courseKey(c.code, c.name);
    const found = existing.find(
      (x) =>
        x.department === c.dept &&
        (x.student_dept ?? '') === studentDept &&
        (x.section ?? '') === (c.section ?? '') &&
        (courseKey(x.code, x.name) === key || similarTitle(x.name, c.name)),
    );
    let courseId: number;
    if (found) {
      courseId = Number(found.id);
    } else {
      const hasLab = c.lab ?? (c.hrs ? c.hrs[1] > 0 : false);
      const rows = await q(
        `insert into courses (academic_year, semester, department, student_dept, section, year_of_study, batch, code, name, crhr,
           total_chapters, has_lab, total_lab_sessions, students, lec_hours, lab_hours, tut_hours, lec_sections, lab_sections,
           tut_sections, curriculum_semester, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'builtin') returning id`,
        [
          academicYear, semester, c.dept, studentDept, c.section ?? '', c.year, c.batch ?? '', c.code ?? '', c.name, c.crhr,
          c.chapters ?? null, hasLab, hasLab ? c.labs ?? weeks : null, c.students ?? null,
          c.hrs?.[0] ?? null, c.hrs?.[1] ?? null, c.hrs?.[2] ?? null,
          c.secs?.[0] ?? null, c.secs?.[1] ?? null, c.secs?.[2] ?? null, c.sem ?? '',
        ],
      );
      courseId = Number(rows[0].id);
      existing.push({ id: courseId, department: c.dept, student_dept: studentDept, section: c.section ?? '', code: c.code ?? '', name: c.name });
      addedCourses++;
    }
    if (c.teacher) {
      let tid = teacherId.get(nameKey(c.teacher));
      if (!tid) {
        const rows = await q(`insert into teachers (name, department, source) values ($1, $2, 'builtin') returning id`, [c.teacher, c.dept]);
        tid = Number(rows[0].id);
        teacherId.set(nameKey(c.teacher), tid);
        addedTeachers++;
      }
      await q(`insert into teacher_courses (teacher_id, course_id) values ($1, $2) on conflict do nothing`, [tid, courseId]);
    }
  }
  return { courses: addedCourses, teachers: addedTeachers };
}
