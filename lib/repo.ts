import 'server-only';
import { query } from './db';
import { mergeSettings } from './defaults';
import { codeKey } from './normalize';
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
  return query<Teacher>(`select id, name, department, active from teachers order by department, name`);
}

export async function getTeacher(id: number): Promise<Teacher | null> {
  const rows = await query<Teacher>(`select id, name, department, active from teachers where id = $1`, [id]);
  return rows[0] ?? null;
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
    year_of_study: r.year_of_study,
    batch: r.batch ?? '',
    code: r.code,
    name: r.name,
    crhr: n(r.crhr),
    total_chapters: n(r.total_chapters),
    has_lab: !!r.has_lab,
    total_lab_sessions: n(r.total_lab_sessions),
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
     group by c.id order by c.department, c.year_of_study, c.code`,
    params,
  );
  return rows.map(mapCourse);
}

export async function getCourse(id: number): Promise<Course | null> {
  const rows = await query(`${COURSE_SELECT} where c.id = $1 group by c.id`, [id]);
  return rows[0] ? mapCourse(rows[0]) : null;
}

export type CourseInput = Omit<Course, 'id' | 'teacher_ids'>;

/** Finds a course in the same period/department with the same code (and batch when given). */
export async function findCourse(c: Pick<Course, 'academic_year' | 'semester' | 'department' | 'code' | 'batch'>) {
  const rows = await query(
    `${COURSE_SELECT} where c.academic_year = $1 and c.semester = $2 and c.department = $3 group by c.id`,
    [c.academic_year, c.semester, c.department],
  );
  const key = codeKey(c.code);
  const same = rows.map(mapCourse).filter((x) => codeKey(x.code) === key);
  return same.find((x) => (x.batch ?? '') === (c.batch ?? '')) ?? (c.batch ? null : same[0]) ?? null;
}

export async function insertCourse(c: CourseInput): Promise<number> {
  const rows = await query<{ id: number }>(
    `insert into courses (academic_year, semester, department, year_of_study, batch, code, name, crhr, total_chapters, has_lab, total_lab_sessions, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [c.academic_year, c.semester, c.department, c.year_of_study, c.batch ?? '', c.code, c.name, c.crhr, c.total_chapters, c.has_lab, c.total_lab_sessions, c.source],
  );
  return rows[0].id;
}

export async function updateCourse(id: number, c: CourseInput) {
  await query(
    `update courses set academic_year=$2, semester=$3, department=$4, year_of_study=$5, batch=$6, code=$7, name=$8,
       crhr=$9, total_chapters=$10, has_lab=$11, total_lab_sessions=$12, source=$13 where id=$1`,
    [id, c.academic_year, c.semester, c.department, c.year_of_study, c.batch ?? '', c.code, c.name, c.crhr, c.total_chapters, c.has_lab, c.total_lab_sessions, c.source],
  );
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
    year_of_study: n(r.year_of_study),
    has_lab: !!r.has_lab,
  };
}

function mapStudentReport(r: any): StudentReport {
  return {
    ...r,
    created_at: iso(r.created_at),
    chapters_covered: n(r.chapters_covered),
    labs_covered: n(r.labs_covered),
    year_of_study: n(r.year_of_study),
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

export async function insertTeacherReport(r: TeacherReportInput): Promise<number> {
  const rows = await query<{ id: number }>(
    `insert into teacher_reports (academic_year, semester, report_type, teacher_id, teacher_name, course_id, department, year_of_study, batch,
       course_code, course_name, crhr, total_chapters, chapters_covered, has_lab, total_lab_sessions, labs_covered, tags, remarks, review, device)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning id`,
    [
      r.academic_year, r.semester, r.report_type, r.teacher_id, r.teacher_name, r.course_id, r.department, r.year_of_study, r.batch,
      r.course_code, r.course_name, r.crhr, r.total_chapters, r.chapters_covered, r.has_lab, r.total_lab_sessions, r.labs_covered,
      r.tags, r.remarks, r.review, r.device,
    ],
  );
  return rows[0].id;
}

export type StudentReportInput = Omit<StudentReport, 'id' | 'created_at'>;

export async function insertStudentReport(r: StudentReportInput) {
  await query(
    `insert into student_reports (submission, academic_year, semester, report_type, student_name, department, year_of_study, course_id,
       course_code, course_name, chapters_covered, labs_covered, comment, review, device)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      r.submission, r.academic_year, r.semester, r.report_type, r.student_name, r.department, r.year_of_study, r.course_id,
      r.course_code, r.course_name, r.chapters_covered, r.labs_covered, r.comment, r.review, r.device,
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
