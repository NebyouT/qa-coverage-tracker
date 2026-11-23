import type { Course, Period, Settings, StudentReport, Teacher, TeacherReport } from './types';
import { courseKey, nameKey, parseSections } from './normalize';
import { score, type Score } from './scoring';

export type FlagKind = 'missing' | 'dup' | 'incomplete' | 'lab' | 'gap' | 'labsection' | 'pending' | 'newcourse';
export type Flag = { kind: FlagKind; label: string; level: 'error' | 'warn' | 'info' };

export type Row = {
  key: string;
  course: Course | null;
  department: string;
  /** Class taking the course, e.g. "IE Sec 1" */
  classLabel: string;
  year_of_study: number | null;
  batch: string;
  code: string;
  name: string;
  crhr: number | null;
  teacherNames: string;
  teacherIds: number[];
  /** The submission used for the report: latest verified, otherwise latest pending. */
  report: TeacherReport | null;
  /** All non-rejected teacher submissions for this course in the period. */
  submissions: TeacherReport[];
  students: StudentReport[];
  studentMedianChapters: number | null;
  studentMedianLabs: number | null;
  score: Score | null;
  flags: Flag[];
  /** Same wording as the Excel "Data Check" column */
  check: string;
};

export const inPeriod = (r: { academic_year: string; semester: string; report_type: string }, p: Period) =>
  r.academic_year === p.academicYear && r.semester === p.semester && r.report_type === p.reportType;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const looseKey = (dept: string, code: string, name: string, batch: string) => `x|${dept}|${courseKey(code, name)}|${batch ?? ''}`;

export function consolidate(args: {
  period: Period;
  settings: Settings;
  courses: Course[];
  teachers: Teacher[];
  teacherReports: TeacherReport[];
  studentReports: StudentReport[];
}): Row[] {
  const { period, settings, teachers } = args;
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const courses = args.courses.filter((c) => c.academic_year === period.academicYear && c.semester === period.semester);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const tReports = args.teacherReports.filter((r) => inPeriod(r, period) && r.review !== 'rejected');
  const sReports = args.studentReports.filter((r) => inPeriod(r, period) && r.review !== 'rejected');

  const groups = new Map<string, { course: Course | null; subs: TeacherReport[]; students: StudentReport[]; sample?: TeacherReport | StudentReport }>();
  const keyFor = (courseId: number | null, dept: string, code: string, name: string, batch: string) =>
    courseId && courseById.has(courseId) ? `c|${courseId}` : looseKey(dept, code, name, batch);
  const group = (key: string, course: Course | null) => {
    let g = groups.get(key);
    if (!g) {
      g = { course, subs: [], students: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const c of courses) group(`c|${c.id}`, c);
  for (const r of tReports) {
    const g = group(keyFor(r.course_id, r.department, r.course_code, r.course_name, r.batch), r.course_id ? courseById.get(r.course_id) ?? null : null);
    g.subs.push(r);
    g.sample ??= r;
  }
  for (const r of sReports) {
    // Students do not know the batch: match free-typed courses by their class + code/title within the period.
    let key = keyFor(r.course_id, r.department, r.course_code, r.course_name, '');
    if (!r.course_id || !courseById.has(r.course_id)) {
      const k = courseKey(r.course_code, r.course_name);
      const match = courses.find(
        (c) => (c.student_dept || c.department) === r.department && (courseKey(c.code, c.name) === k || courseKey('', c.name) === courseKey('', r.course_name)),
      );
      key = match ? `c|${match.id}` : key;
    }
    const g = group(key, key.startsWith('c|') ? courseById.get(Number(key.slice(2))) ?? null : null);
    g.students.push(r);
    g.sample ??= r;
  }

  const rows: Row[] = [];
  for (const [key, g] of groups) {
    const subs = [...g.subs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const report = subs.find((s) => s.review === 'verified') ?? subs[0] ?? null;
    const c = g.course;
    const sample = g.sample as (TeacherReport & StudentReport) | undefined;

    const linkedTeachers = (c?.teacher_ids ?? []).map((id) => teacherById.get(id)?.name).filter(Boolean) as string[];
    const reportingTeachers = [...new Set(subs.map((s) => s.teacher_name).filter(Boolean))];
    const teacherNames = (reportingTeachers.length ? reportingTeachers : linkedTeachers).join(', ');

    const chapters = g.students.map((s) => s.chapters_covered).filter((v): v is number => v !== null && v !== undefined);
    const labs = g.students.map((s) => s.labs_covered).filter((v): v is number => v !== null && v !== undefined);
    const studentMedianChapters = median(chapters);
    const studentMedianLabs = median(labs);

    const sc = report ? score(report, settings) : null;
    const flags: Flag[] = [];
    let check = '';

    if (!report) {
      flags.push({ kind: 'missing', label: 'No teacher report', level: 'warn' });
    } else {
      const distinctTeachers = new Set(subs.map((s) => s.teacher_id ?? nameKey(s.teacher_name)));
      if (subs.length > 1)
        flags.push({
          kind: 'dup',
          label: distinctTeachers.size > 1 ? `${subs.length} submissions from ${distinctTeachers.size} teachers` : `Duplicate (${subs.length} submissions)`,
          level: 'warn',
        });
      const incomplete = !report.total_chapters || report.chapters_covered === null || !(report.course_code || report.course_name) || !report.department || !report.year_of_study;
      const labMissing = report.has_lab && (!report.total_lab_sessions || report.labs_covered === null);
      if (incomplete) flags.push({ kind: 'incomplete', label: 'Incomplete', level: 'error' });
      if (labMissing) flags.push({ kind: 'lab', label: 'Lab data missing', level: 'error' });
      if (studentMedianChapters !== null && report.chapters_covered !== null) {
        const diff = report.chapters_covered - studentMedianChapters;
        if (Math.abs(diff) >= settings.gapThreshold)
          flags.push({
            kind: 'gap',
            label: `Students say ${studentMedianChapters} ch, teacher ${report.chapters_covered}`,
            level: 'error',
          });
      }
      const perSection = parseSections(report.labs_by_section);
      if (report.has_lab && perSection.length > 1) {
        const hi = Math.max(...perSection);
        const lo = Math.min(...perSection);
        if (hi - lo >= settings.labGapThreshold)
          flags.push({ kind: 'labsection', label: `Lab sections uneven (${perSection.join(' vs ')})`, level: 'warn' });
      }
      if (report.review === 'pending') flags.push({ kind: 'pending', label: 'Not verified yet', level: 'info' });
      check = subs.length > 1 ? 'DUPLICATE record' : incomplete ? 'Incomplete' : labMissing ? 'Lab data missing' : 'OK';
    }
    if (c?.source === 'teacher') flags.push({ kind: 'newcourse', label: 'New course added by teacher', level: 'info' });

    rows.push({
      key,
      course: c,
      department: c?.department ?? report?.department ?? sample?.department ?? '',
      classLabel: c
        ? [c.student_dept || c.department, c.section].filter(Boolean).join(' ')
        : report
          ? [report.student_dept || report.department, report.section].filter(Boolean).join(' ')
          : sample?.department ?? '',
      year_of_study: c?.year_of_study ?? report?.year_of_study ?? sample?.year_of_study ?? null,
      batch: c?.batch ?? report?.batch ?? '',
      code: c?.code ?? report?.course_code ?? sample?.course_code ?? '',
      name: c?.name ?? report?.course_name ?? sample?.course_name ?? '',
      crhr: c?.crhr ?? report?.crhr ?? null,
      teacherNames,
      teacherIds: [...new Set([...(c?.teacher_ids ?? []), ...(subs.map((s) => s.teacher_id).filter(Boolean) as number[])])],
      report,
      submissions: subs,
      students: g.students,
      studentMedianChapters,
      studentMedianLabs,
      score: sc,
      flags,
      check,
    });
  }

  return rows.sort(
    (a, b) =>
      a.department.localeCompare(b.department) ||
      (a.year_of_study ?? 99) - (b.year_of_study ?? 99) ||
      a.name.localeCompare(b.name) ||
      a.classLabel.localeCompare(b.classLabel),
  );
}

export type DeptSummary = {
  department: string;
  reported: number;
  total: number;
  avgLecture: number | null;
  avgLab: number | null;
  avgRate: number | null;
  statusCounts: Record<string, number>;
};

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function summarize(rows: Row[], settings: Settings, final: boolean): DeptSummary[] {
  const bands = final ? settings.finalBands : settings.midBands;
  const depts = [...new Set([...settings.departments.map((d) => d.code), ...rows.map((r) => r.department)])].filter(Boolean);
  const make = (department: string, subset: Row[]): DeptSummary => {
    const rep = subset.filter((r) => r.score?.rate !== null && r.score !== null);
    const statusCounts: Record<string, number> = {};
    for (const b of bands) statusCounts[b.name] = 0;
    for (const r of rep) statusCounts[r.score!.status] = (statusCounts[r.score!.status] ?? 0) + 1;
    return {
      department,
      reported: rep.length,
      total: subset.length,
      avgLecture: avg(rep.map((r) => r.score!.lecture)),
      avgLab: avg(rep.map((r) => r.score!.lab)),
      avgRate: avg(rep.map((r) => r.score!.rate)),
      statusCounts,
    };
  };
  const out = depts.map((d) => make(d, rows.filter((r) => r.department === d)));
  out.push(make('All', rows));
  return out;
}

export function byDeptYear(rows: Row[], settings: Settings) {
  const depts = [...new Set([...settings.departments.map((d) => d.code), ...rows.map((r) => r.department)])].filter(Boolean);
  const table = depts.map((d) => ({
    department: d,
    values: settings.years.map((y) => avg(rows.filter((r) => r.department === d && r.year_of_study === y && r.score).map((r) => r.score!.rate))),
  }));
  table.push({
    department: 'All',
    values: settings.years.map((y) => avg(rows.filter((r) => r.year_of_study === y && r.score).map((r) => r.score!.rate))),
  });
  return table;
}

export type TeacherSummary = {
  teacher: Teacher | null;
  name: string;
  department: string;
  courses: number;
  reported: number;
  avgRate: number | null;
  flags: number;
  lastReport: string | null;
};

export function summarizeTeachers(rows: Row[], teachers: Teacher[]): TeacherSummary[] {
  const out: TeacherSummary[] = [];
  for (const t of teachers) {
    const mine = rows.filter((r) => r.teacherIds.includes(t.id));
    const myReports = mine.flatMap((r) => r.submissions.filter((s) => s.teacher_id === t.id));
    out.push({
      teacher: t,
      name: t.name,
      department: t.department,
      courses: mine.length,
      reported: mine.filter((r) => r.submissions.some((s) => s.teacher_id === t.id)).length,
      avgRate: avg(mine.filter((r) => r.report?.teacher_id === t.id).map((r) => r.score?.rate ?? null)),
      flags: mine.reduce((n, r) => n + r.flags.filter((f) => f.level !== 'info').length, 0),
      lastReport: myReports.map((s) => s.created_at).sort().pop() ?? null,
    });
  }
  return out.sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
}
