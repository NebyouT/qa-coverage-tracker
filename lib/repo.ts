import 'server-only';
import { query } from './db';
import { mergeSettings } from './defaults';
import { courseKey, nameKey } from './normalize';
import type { Course, Period, Settings, StudentReport, Teacher, TeacherReport } from './types';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ---------- settings ----------
export async function getSettings(): Promise<Settings> {
  const rows = await query<{ value: Settings }>(`select value from settings where key = 'config'`);
  return mergeSettings(rows[0]?.value);
}

export async function saveSettings(s: Settings): Promise<Settings> {
  await query(
    `insert into settings (key, value) values ('config', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(s)],
  );
  return s;
}

// ---------- teachers ----------
export async function listTeachers(): Promise<Teacher[]> {
  return query<Teacher>(`select id, name, department, active, source from teachers order by department, name`);
}

export async function getTeacher(id: number): Promise<Teacher | null> {
  const rows = await query<Teacher>(`select id, name, department, active, source from teachers where id = $1`, [id]);
  return rows[0] ?? null;
}

/** Returns the existing teacher with the same name (ignoring case/spaces) or creates one. */
export async function findOrCreateTeacher(name: string, department: string, source: string): Promise<Teacher> {
  const all = await listTeachers();
  const found = all.find((t) => nameKey(t.name) === nameKey(name));
  if (found) return found;
  const rows = await query<Teacher>(
    `insert into teachers (name, department, source) values ($1, $2, $3) returning id, name, department, active, source`,
    [name, department, source],
  );
  return rows[0];
}

// ---------- courses ----------
const COURSE_SELECT = `
  select c.*, coalesce(array_agg(tc.teacher_id) filter (where tc.teacher_id is not null), '{}') as teacher_ids
  from courses c left join teacher_courses tc on tc.course_id = c.id`;

function mapCourse(r: any): Course {
  return {
    id: r.id,
    academic_year: r.academic_year,
    semester: r.semester,
    department: r.department,
    student_dept: r.student_dept ?? '',
    section: r.section ?? '',
    year_of_study: r.year_of_study,
    batch: r.batch ?? '',
    code: r.code ?? '',
    name: r.name,
    crhr: n(r.crhr),
    total_chapters: n(r.total_chapters),
    has_lab: !!r.has_lab,
    total_lab_sessions: n(r.total_lab_sessions),
    students: n(r.students),
    lec_hours: n(r.lec_hours),
    lab_hours: n(r.lab_hours),
    tut_hours: n(r.tut_hours),
    lec_sections: n(r.lec_sections),
    lab_sections: n(r.lab_sections),
    tut_sections: n(r.tut_sections),
    curriculum_semester: r.curriculum_semester ?? '',
    source: r.source,
    teacher_ids: (r.teacher_ids ?? []).map(Number),
  };
}

export async function listCourses(f: { academicYear?: string; semester?: string } = {}): Promise<Course[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.academicYear) {
    params.push(f.academicYear);
    where.push(`c.academic_year = $${params.length}`);
  }
  if (f.semester) {
    params.push(f.semester);
    where.push(`c.semester = $${params.length}`);
  }
  const rows = await query(
    `${COURSE_SELECT} ${where.length ? 'where ' + where.join(' and ') : ''}
     group by c.id order by c.department, c.year_of_study, c.name`,
    params,
  );
  return rows.map(mapCourse);
}

export async function getCourse(id: number): Promise<Course | null> {
  const rows = await query(`${COURSE_SELECT} where c.id = $1 group by c.id`, [id]);
  return rows[0] ? mapCourse(rows[0]) : null;
}

type CourseCore = Pick<Course, 'academic_year' | 'semester' | 'department' | 'year_of_study' | 'code' | 'name' | 'source'>;
export type CourseInput = CourseCore & Partial<Omit<Course, 'id' | 'teacher_ids' | keyof CourseCore>>;

/**
 * Finds the same course in a period/department: same code (or title when there is no code),
 * and the same class/section and batch when those are given.
 */
export async function findCourse(c: {
  academic_year: string;
  semester: string;
  department: string;
  code: string;
  name?: string;
  batch?: string;
  student_dept?: string;
  section?: string;
}): Promise<Course | null> {
  const rows = await query(
    `${COURSE_SELECT} where c.academic_year = $1 and c.semester = $2 and c.department = $3 group by c.id`,
    [c.academic_year, c.semester, c.department],
  );
  const key = courseKey(c.code, c.name);
  let same = rows.map(mapCourse).filter((x) => courseKey(x.code, x.name) === key || (x.code && courseKey(x.code, '') === key));
  if (c.student_dept !== undefined) {
    same = same.filter((x) => (x.student_dept || x.department) === (c.student_dept || c.department) && (x.section ?? '') === (c.section ?? ''));
  }
  return same.find((x) => (x.batch ?? '') === (c.batch ?? '')) ?? (c.batch ? null : same[0]) ?? null;
}

const COURSE_COLS = [
  'academic_year', 'semester', 'department', 'student_dept', 'section', 'year_of_study', 'batch', 'code', 'name', 'crhr',
  'total_chapters', 'has_lab', 'total_lab_sessions', 'students', 'lec_hours', 'lab_hours', 'tut_hours', 'lec_sections',
  'lab_sections', 'tut_sections', 'curriculum_semester', 'source',
] as const;

function courseValues(c: CourseInput): unknown[] {
  const d: Record<string, unknown> = {
    student_dept: '', section: '', batch: '', crhr: null, total_chapters: null, has_lab: false, total_lab_sessions: null,
    students: null, lec_hours: null, lab_hours: null, tut_hours: null, lec_sections: null, lab_sections: null,
    tut_sections: null, curriculum_semester: '',
  };
  return COURSE_COLS.map((k) => ((c as any)[k] === undefined ? d[k] ?? null : (c as any)[k]));
}

export async function insertCourse(c: CourseInput): Promise<number> {
  const rows = await query<{ id: number }>(
    `insert into courses (${COURSE_COLS.join(', ')}) values (${COURSE_COLS.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    courseValues(c),
  );
  return rows[0].id;
}

export async function updateCourse(id: number, c: CourseInput) {
  await query(`update courses set ${COURSE_COLS.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [id, ...courseValues(c)]);
}

export async function setCourseTeachers(courseId: number, teacherIds: number[]) {
  await query(`delete from teacher_courses where course_id = $1`, [courseId]);
  for (const t of teacherIds) await linkTeacher(t, courseId);
}

export async function linkTeacher(teacherId: number, courseId: number) {
  await query(`insert into teacher_courses (teacher_id, course_id) values ($1, $2) on conflict do nothing`, [teacherId, courseId]);
}

// ---------- reports ----------
function mapTeacherReport(r: any): TeacherReport {
  return {
    ...r,
    created_at: iso(r.created_at),
    crhr: n(r.crhr),
    total_chapters: n(r.total_chapters),
    chapters_covered: n(r.chapters_covered),
    total_lab_sessions: n(r.total_lab_sessions),
    labs_covered: n(r.labs_covered),
    tutorials_done: n(r.tutorials_done),
    year_of_study: n(r.year_of_study),
    has_lab: !!r.has_lab,
    student_dept: r.student_dept ?? '',
    section: r.section ?? '',
    labs_by_section: r.labs_by_section ?? '',
    answers: r.answers ?? '',
  };
}

function mapStudentReport(r: any): StudentReport {
  return {
    ...r,
    created_at: iso(r.created_at),
    chapters_covered: n(r.chapters_covered),
    labs_covered: n(r.labs_covered),
    year_of_study: n(r.year_of_study),
    answers: r.answers ?? '',
  };
}

export async function listTeacherReports(p?: Period, teacherId?: number): Promise<TeacherReport[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (p) {
    params.push(p.academicYear, p.semester, p.reportType);
    where.push(`academic_year = $1 and semester = $2 and report_type = $3`);
  }
  if (teacherId) {
    params.push(teacherId);
    where.push(`teacher_id = $${params.length}`);
  }
  const rows = await query(`select * from teacher_reports ${where.length ? 'where ' + where.join(' and ') : ''} order by created_at desc`, params);
  return rows.map(mapTeacherReport);
}

export async function listStudentReports(p?: Period): Promise<StudentReport[]> {
  const rows = p
    ? await query(`select * from student_reports where academic_year=$1 and semester=$2 and report_type=$3 order by created_at desc, id`, [
        p.academicYear,
        p.semester,
        p.reportType,
      ])
    : await query(`select * from student_reports order by created_at desc, id`);
  return rows.map(mapStudentReport);
}

export type TeacherReportInput = Omit<TeacherReport, 'id' | 'created_at'>;

const TR_COLS = [
  'academic_year', 'semester', 'report_type', 'teacher_id', 'teacher_name', 'course_id', 'department', 'student_dept', 'section',
  'year_of_study', 'batch', 'course_code', 'course_name', 'crhr', 'total_chapters', 'chapters_covered', 'has_lab',
  'total_lab_sessions', 'labs_covered', 'labs_by_section', 'tutorials_done', 'answers', 'tags', 'remarks', 'review', 'device',
] as const;

export async function insertTeacherReport(r: TeacherReportInput): Promise<number> {
  const rows = await query<{ id: number }>(
    `insert into teacher_reports (${TR_COLS.join(', ')}) values (${TR_COLS.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    TR_COLS.map((k) => (r as any)[k] ?? (['labs_by_section', 'student_dept', 'section', 'answers'].includes(k) ? '' : null)),
  );
  return rows[0].id;
}

export type StudentReportInput = Omit<StudentReport, 'id' | 'created_at'>;

export async function insertStudentReport(r: StudentReportInput) {
  await query(
    `insert into student_reports (submission, academic_year, semester, report_type, student_name, department, year_of_study, course_id,
       course_code, course_name, chapters_covered, labs_covered, answers, comment, review, device)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      r.submission, r.academic_year, r.semester, r.report_type, r.student_name, r.department, r.year_of_study, r.course_id,
      r.course_code, r.course_name, r.chapters_covered, r.labs_covered, r.answers ?? '', r.comment, r.review, r.device,
    ],
  );
}

/** Every period that has courses or reports, plus the active one, newest first. */
export async function listPeriods(active: Period): Promise<Period[]> {
  const rows = await query<{ academic_year: string; semester: string; report_type: string }>(
    `select distinct academic_year, semester, report_type from teacher_reports
     union select distinct academic_year, semester, report_type from student_reports`,
  );
  const all = [active, ...rows.map((r) => ({ academicYear: r.academic_year, semester: r.semester, reportType: r.report_type }))];
  const seen = new Set<string>();
  return all
    .filter((p) => {
      const k = `${p.academicYear}|${p.semester}|${p.reportType}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.academicYear.localeCompare(a.academicYear) || b.semester.localeCompare(a.semester) || b.reportType.localeCompare(a.reportType));
}
