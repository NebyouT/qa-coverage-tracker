import crypto from 'node:crypto';
import { bad, fail, ok, readJson } from '@/lib/http';
import { clean, codeKey, int } from '@/lib/normalize';
import { getSettings, insertStudentReport, listCourses } from '@/lib/repo';

export const dynamic = 'force-dynamic';

type Item = { courseId?: number; newCourse?: { code: string; name: string }; chaptersCovered: number; labsCovered?: number | null };

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

    const name = clean(body.name).slice(0, 80);
    if (name.length < 2) bad('Please write your name.');
    const department = clean(body.department);
    if (!s.departments.some((d) => d.code === department)) bad('Please choose your department.');
    const year = int(body.yearOfStudy, 1, 7);
    if (!year || !s.years.includes(year)) bad('Please choose your year.');
    const semester = clean(body.semester);
    if (!s.semesters.includes(semester)) bad('Please choose the semester.');

    const items = Array.isArray(body.items) ? body.items.slice(0, 15) : [];
    if (!items.length) bad('Report at least one course.');

    const courses = await listCourses({ academicYear: s.period.academicYear, semester });
    const byId = new Map(courses.map((c) => [c.id, c]));
    const submission = crypto.randomUUID();
    const device = clean(body.device).slice(0, 64);
    const comment = clean(body.comment).slice(0, 500);

    let count = 0;
    for (const it of items) {
      const covered = int(it.chaptersCovered, 0, 100);
      if (covered === null) continue;
      let course = it.courseId ? byId.get(Number(it.courseId)) : undefined;
      let code = course?.code ?? clean(it.newCourse?.code).slice(0, 30);
      let cname = course?.name ?? clean(it.newCourse?.name).slice(0, 120);
      if (!course) {
        if (!code && !cname) continue;
        // Link a typed course to the catalogue when the code matches.
        course = courses.find((c) => c.department === department && codeKey(c.code) === codeKey(code) && codeKey(code) !== '');
        if (course) {
          code = course.code;
          cname = course.name;
        }
      }
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
        labs_covered: course?.has_lab ? int(it.labsCovered, 0, 200) : null,
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
