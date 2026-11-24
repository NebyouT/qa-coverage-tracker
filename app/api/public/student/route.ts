import crypto from 'node:crypto';
import { bad, fail, ok, readJson } from '@/lib/http';
import { clean, courseKey, int, parseAnswers, studentDepartments } from '@/lib/normalize';
import { getSettings, insertStudentReport, listCourses } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Item = {
  courseId?: number;
  newCourse?: { code?: string; name: string };
  chaptersCovered: number;
  labsCovered?: number | null;
  /** 1, 2, … when the course has several lab sections */
  labSection?: number | null;
  answers?: Record<string, string>;
};

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      name: string;
      department: string;
      yearOfStudy: number;
      semester: string;
      items: Item[];
      comment?: string;
      device?: string;
    }>(req);
    const s = await getSettings();
    if (!s.studentsOpen) bad('Student reporting is closed right now.');

    const semester = clean(body.semester);
    if (!s.semesters.includes(semester)) bad('Please choose the semester.');
    const courses = await listCourses({ academicYear: s.period.academicYear, semester });

    const name = clean(body.name).slice(0, 80);
    if (name.length < 2) bad('Please write your name.');
    const department = clean(body.department);
    if (!studentDepartments(s.departments.map((d) => d.code), courses).includes(department)) bad('Please choose your department.');
    const year = int(body.yearOfStudy, 1, 7);
    if (!year || !s.years.includes(year)) bad('Please choose your year.');

    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    if (!items.length) bad('Report at least one course.');

    const byId = new Map(courses.map((c) => [c.id, c]));
    const submission = crypto.randomUUID();
    const device = clean(body.device).slice(0, 64);
    const comment = clean(body.comment).slice(0, 500);

    const keys = new Set(s.questions.map((x) => x.key));
    let count = 0;
    for (const it of items) {
      const covered = int(it.chaptersCovered, 0, 100);
      if (covered === null) continue;
      let course = it.courseId ? byId.get(Number(it.courseId)) : undefined;
      let code = course?.code ?? clean(it.newCourse?.code).slice(0, 30);
      let cname = course?.name ?? clean(it.newCourse?.name).slice(0, 120);
      if (!course) {
        if (!code && !cname) continue;
        // Link a typed course to the course list when the code or title matches for this class.
        const k = courseKey(code, cname);
        course = courses.find((c) => (c.student_dept || c.department) === department && courseKey(c.code, c.name) === k);
        if (course) {
          code = course.code;
          cname = course.name;
        }
      }
      const labs = course?.has_lab ? int(it.labsCovered, 0, 200) : null;
      const answers = Object.fromEntries(Object.entries(parseAnswers(it.answers)).filter(([k]) => keys.has(k)));
      if (keys.has('lab') && labs !== null && labs > 0) answers.lab = 'yes';
      await insertStudentReport({
        submission,
        academic_year: s.period.academicYear,
        semester,
        report_type: s.period.reportType,
        student_name: name,
        department,
        year_of_study: year,
        course_id: course?.id ?? null,
        course_code: code,
        course_name: cname,
        chapters_covered: covered,
        labs_covered: labs,
        lab_section: course?.has_lab && (course.lab_sections ?? 1) > 1 ? int(it.labSection, 1, course.lab_sections ?? 1) : null,
        answers: JSON.stringify(answers),
        comment,
        review: 'pending',
        device,
      });
      count++;
    }
    if (!count) bad('Report at least one course.');
    return ok({ ok: true, saved: count });
  } catch (e) {
    return fail(e);
  }
}
