import type { Course, Period, Settings, StudentReport, Teacher, TeacherReport } from './types';
import { courseKey, nameKey, parseAnswers, parseSections } from './normalize';
import { score, type Score } from './scoring';

export type FlagKind = 'missing' | 'dup' | 'incomplete' | 'lab' | 'gap' | 'labsection' | 'answer' | 'pending' | 'newcourse';

/** How a student's report compares with the teacher's report used for the course. */
export type StudentCheck = { agree: boolean; differences: string[] };

export type Agreement = {
  /** students who reported this course */
  total: number;
  /** students whose report matches the teacher's (chapters, labs, yes/no answers) */
  agree: number;
  chapters: { total: number; agree: number };
  labs: { total: number; agree: number };
  byStudent: Record<number, StudentCheck>;
};

/** One yes/no question for a course: the teacher's answer and how students answered. */
export type Check = { key: string; label: string; teacher: 'yes' | 'no' | null; studentsYes: number; studentsNo: number };
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
  /** The submission used for the report: the newest one you verified, otherwise the FIRST one sent (later ones never replace it). */
  report: TeacherReport | null;
  /** How many students agree with that report */
  agreement: Agreement;
  /** All non-rejected teacher submissions for this course in the period. */
  submissions: TeacherReport[];
  students: StudentReport[];
  studentMedianChapters: number | null;
  studentMedianLabs: number | null;
  score: Score | null;
  /** Quiz / assignment / mid-exam / lab class answers */
  checks: Check[];
  flags: Flag[];
  /** Same wording as the Excel "Data Check" column */
  check: string;
};

export const inPeriod = (r: { academic_year: string; semester: string; report_type: string }, p: Period) =>
  r.academic_year === p.academicYear && r.semester === p.semester && r.report_type === p.reportType;

export type DupGroup<T> = { key: string; title: string; subtitle: string; entries: T[]; open: number };

export type Duplicates = {
  /** Same course reported more than once by teachers in the period */
  teacherReports: DupGroup<TeacherReport>[];
  /** Same student name reporting the same course more than once */
  studentReports: DupGroup<StudentReport>[];
  /** Same course listed twice in the course list (same class and section) */
  courses: DupGroup<Course>[];
  /** Teacher names that are the same or look like the same person (e.g. "Nebyu T." and "Nebyu Tilahun") */
  teachers: DupGroup<Teacher>[];
};

const firstTwo = (name: string) => {
  const w = nameKey(name).replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  return w.length ? `${w[0]}|${(w[1] ?? '')[0] ?? ''}` : '';
};

/** Every entry that was added more than once, newest first inside each group. Rejected entries are shown but not counted as open. */
export function findDuplicates(args: {
  period: Period;
  courses: Course[];
  teachers: Teacher[];
  teacherReports: TeacherReport[];
  studentReports: StudentReport[];
}): Duplicates {
  const { period } = args;
  const courseById = new Map(args.courses.map((c) => [c.id, c]));
  const label = (c: Course | undefined, name: string, cls: string) => ({
    title: c?.name ?? name,
    subtitle: c ? [c.student_dept || c.department, c.section, `Year ${c.year_of_study}`].filter(Boolean).join(' · ') : cls,
  });
  const byNewest = <T extends { created_at: string }>(a: T, b: T) => +new Date(b.created_at) - +new Date(a.created_at);

  const tGroups = new Map<string, TeacherReport[]>();
  for (const r of args.teacherReports.filter((x) => inPeriod(x, period))) {
    const k = r.course_id ? `c${r.course_id}` : `x${r.department}|${courseKey(r.course_code, r.course_name)}|${r.student_dept}|${r.section}`;
    tGroups.set(k, [...(tGroups.get(k) ?? []), r]);
  }
  const teacherReports = [...tGroups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({
      key,
      ...label(courseById.get(v[0].course_id ?? -1), v[0].course_name, [v[0].student_dept || v[0].department, v[0].section].filter(Boolean).join(' ')),
      entries: v.sort(byNewest),
      open: v.filter((x) => x.review !== 'rejected').length,
    }));

  const sGroups = new Map<string, StudentReport[]>();
  for (const r of args.studentReports.filter((x) => inPeriod(x, period))) {
    const k = `${nameKey(r.student_name)}|${r.course_id ? `c${r.course_id}` : courseKey(r.course_code, r.course_name)}`;
    sGroups.set(k, [...(sGroups.get(k) ?? []), r]);
  }
  const studentReports = [...sGroups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => {
      const c = courseById.get(v[0].course_id ?? -1);
      return {
        key,
        title: v[0].student_name,
        subtitle: `${c?.name ?? v[0].course_name} · ${v[0].department} Year ${v[0].year_of_study ?? '–'}`,
        entries: v.sort(byNewest),
        open: v.filter((x) => x.review !== 'rejected').length,
      };
    });

  const cGroups = new Map<string, Course[]>();
  for (const c of args.courses.filter((x) => x.academic_year === period.academicYear && x.semester === period.semester)) {
    const k = `${c.department}|${c.student_dept}|${c.section}|${courseKey('', c.name)}|${c.batch}`;
    cGroups.set(k, [...(cGroups.get(k) ?? []), c]);
  }
  const courses = [...cGroups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key, ...label(v[0], v[0].name, ''), entries: v, open: v.length }));

  const tnGroups = new Map<string, Teacher[]>();
  for (const t of args.teachers) {
    const k = firstTwo(t.name);
    if (k) tnGroups.set(k, [...(tnGroups.get(k) ?? []), t]);
  }
  const teachers = [...tnGroups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key, title: v.map((t) => t.name).join(' / '), subtitle: 'Same or similar name', entries: v, open: v.length }));

  return { teacherReports, studentReports, courses, teachers };
}

/**
 * Compares each student's report with the teacher's: chapters within (gapThreshold - 1), lab sessions of the
 * student's own lab section within (labGapThreshold - 1), and the same yes/no answers where both answered.
 */
export function compareStudents(report: TeacherReport | null, students: StudentReport[], settings: Settings): Agreement {
  const out: Agreement = { total: students.length, agree: 0, chapters: { total: 0, agree: 0 }, labs: { total: 0, agree: 0 }, byStudent: {} };
  if (!report) {
    for (const s of students) out.byStudent[s.id] = { agree: false, differences: ['No teacher report to compare with'] };
    return out;
  }
  const tAns = parseAnswers(report.answers);
  const perSection = parseSections(report.labs_by_section);
  for (const s of students) {
    const diffs: string[] = [];
    if (s.chapters_covered !== null && report.chapters_covered !== null) {
      out.chapters.total++;
      if (Math.abs(s.chapters_covered - report.chapters_covered) < settings.gapThreshold) out.chapters.agree++;
      else diffs.push(`Chapters ${s.chapters_covered} (teacher ${report.chapters_covered})`);
    }
    if (report.has_lab && s.labs_covered !== null) {
      const teacherLabs =
        s.lab_section && perSection.length >= s.lab_section ? perSection[s.lab_section - 1] : report.labs_covered;
      if (teacherLabs !== null && teacherLabs !== undefined) {
        out.labs.total++;
        if (Math.abs(s.labs_covered - teacherLabs) < settings.labGapThreshold) out.labs.agree++;
        else diffs.push(`Labs ${s.labs_covered}${s.lab_section ? ` (sec ${s.lab_section})` : ''} (teacher ${teacherLabs})`);
      }
    }
    const sAns = parseAnswers(s.answers);
    for (const q of settings.questions) {
      if (sAns[q.key] && tAns[q.key] && sAns[q.key] !== tAns[q.key]) diffs.push(`${q.key[0].toUpperCase()}${q.key.slice(1)}: ${sAns[q.key]} (teacher ${tAns[q.key]})`);
    }
    const agree = diffs.length === 0;
    if (agree) out.agree++;
    out.byStudent[s.id] = { agree, differences: diffs };
  }
  return out;
}

/** Rows the QA team should look at: errors, duplicates, teacher/student disagreements, uneven lab sections. */
export const needsAttention = (r: Row) =>
  r.flags.some((f) => f.level === 'error' || f.kind === 'dup' || f.kind === 'answer' || f.kind === 'labsection');

/** "Quiz: yes · Assignment: no" from stored answers JSON */
export function answerSummary(json: string, questions: { key: string }[]): string {
  const a = parseAnswers(json);
  return questions
    .filter((qn) => a[qn.key])
    .map((qn) => `${qn.key[0].toUpperCase()}${qn.key.slice(1)}: ${a[qn.key]}`)
    .join(' · ');
}

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
    // A later submission never replaces the first one on its own: the admin decides by verifying.
    const report = subs.find((s) => s.review === 'verified') ?? subs[subs.length - 1] ?? null;
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
    // Yes/no questions: teacher's answer vs. students' majority.
    const hasLab = !!(report?.has_lab ?? c?.has_lab);
    const tAns = parseAnswers(report?.answers);
    const sAns = g.students.map((st) => parseAnswers(st.answers));
    const checks: Check[] = settings.questions
      .filter((qn) => !qn.labOnly || hasLab)
      .map((qn) => ({
        key: qn.key,
        label: qn.teacher,
        teacher: tAns[qn.key] ?? null,
        studentsYes: sAns.filter((a) => a[qn.key] === 'yes').length,
        studentsNo: sAns.filter((a) => a[qn.key] === 'no').length,
      }));
    for (const ck of checks) {
      const n = ck.studentsYes + ck.studentsNo;
      if (!ck.teacher || n < 2) continue;
      const studentsSay = ck.studentsYes > ck.studentsNo ? 'yes' : ck.studentsNo > ck.studentsYes ? 'no' : null;
      if (studentsSay && studentsSay !== ck.teacher) {
        const word = settings.questions.find((x) => x.key === ck.key)?.key ?? ck.key;
        flags.push({
          kind: 'answer',
          label: `${word[0].toUpperCase()}${word.slice(1)}: teacher ${ck.teacher}, students ${studentsSay} (${ck.studentsYes}/${n} yes)`,
          level: 'warn',
        });
      }
    }

    const agreement = compareStudents(report, g.students, settings);

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
      agreement,
      submissions: subs,
      students: g.students,
      studentMedianChapters,
      studentMedianLabs,
      score: sc,
      checks,
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
