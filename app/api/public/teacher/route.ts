import { bad, fail, HttpError, ok, readJson } from '@/lib/http';
import { clean, int, num, parseAnswers, splitClass } from '@/lib/normalize';
import {
  findCourse,
  findOrCreateTeacher,
  getCourse,
  getSettings,
  getTeacher,
  insertCourse,
  insertTeacherReport,
  linkTeacher,
  listCourses,
  listTeacherReports,
} from '@/lib/repo';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** A teacher's linked courses for the active period and their own submissions in it. */
export async function GET(req: Request) {
  try {
    const id = int(new URL(req.url).searchParams.get('id'), 1, 1e9);
    if (!id) bad('Missing teacher id');
    const teacher = await getTeacher(id);
    if (!teacher || !teacher.active) throw new HttpError(404, 'Teacher not found');
    const s = await getSettings();
    const [courses, reports] = await Promise.all([
      listCourses({ academicYear: s.period.academicYear, semester: s.period.semester }),
      listTeacherReports(s.period, id),
    ]);
    return ok({ teacher, courses: courses.filter((c) => c.teacher_ids.includes(id)), reports });
  } catch (e) {
    return fail(e);
  }
}

type Item = {
  courseId?: number;
  newCourse?: { code?: string; name: string; yearOfStudy: number; batch?: string; crhr?: number | null; studentDept?: string; section?: string };
  totalChapters: number;
  chaptersCovered: number;
  hasLab: boolean;
  totalLabSessions?: number | null;
  labsCovered?: number | null;
  /** One value per lab section when the course has more than one */
  labsBySection?: (number | null)[];
  tutorialsDone?: number | null;
  answers?: Record<string, string>;
  tags?: string[];
  remarks?: string;
};

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action: string;
      teacherId?: number;
      courseId?: number;
      items?: Item[];
      device?: string;
      name?: string;
      department?: string;
    }>(req);
    const s = await getSettings();

    // A teacher whose name is not in the list adds it. The admin sees it marked "New".
    if (body.action === 'register') {
      if (!s.teachersOpen) bad('Teacher reporting is closed right now.');
      const name = clean(body.name).slice(0, 80);
      if (name.length < 3) bad('Please write your full name.');
      const dept = clean(body.department);
      if (!s.departments.some((d) => d.code === dept)) bad('Please choose your department.');
      const t = await findOrCreateTeacher(name, dept, 'teacher');
      if (!t.active) bad('This name is hidden by the QA team. Please contact them.');
      return ok({ teacher: { id: t.id, name: t.name, department: t.department } });
    }

    const teacherId = int(body.teacherId, 1, 1e9);
    const teacher = teacherId ? await getTeacher(teacherId) : null;
    if (!teacher || !teacher.active) throw new HttpError(404, 'Teacher not found. Reload the page and pick your name again.');

    if (body.action === 'unlink') {
      const courseId = int(body.courseId, 1, 1e9);
      await query(`delete from teacher_courses where teacher_id = $1 and course_id = $2`, [teacher.id, courseId]);
      return ok({ ok: true });
    }

    if (body.action !== 'submit') bad('Unknown action');
    if (!s.teachersOpen) bad('Teacher reporting is closed right now.');
    const items = Array.isArray(body.items) ? body.items.slice(0, 15) : [];
    if (!items.length) bad('Nothing to submit');
    const device = clean(body.device).slice(0, 64);
    const p = s.period;
    const saved: number[] = [];

    for (const it of items) {
      const total = int(it.totalChapters, 1, 100);
      const covered = int(it.chaptersCovered, 0, 100);
      if (!total || covered === null) bad('Each course needs total chapters and chapters covered.');
      if (covered > total) bad('Chapters covered cannot be more than total chapters.');
      const hasLab = !!it.hasLab;
      const totalLabs = hasLab ? int(it.totalLabSessions, 1, 200) : null;
      let labsCovered: number | null = null;
      let labsBySection = '';
      if (hasLab) {
        const per = Array.isArray(it.labsBySection) ? it.labsBySection.slice(0, 10).map((v) => int(v, 0, 200)) : [];
        if (per.length > 1) {
          if (per.some((v) => v === null)) bad('Fill labs done for every lab section.');
          labsCovered = Math.round(((per as number[]).reduce((a, b) => a + b, 0) / per.length) * 100) / 100;
          labsBySection = per.join('|');
          if ((per as number[]).some((v) => v > totalLabs!)) bad('Labs done cannot be more than total lab sessions.');
        } else {
          labsCovered = int(it.labsCovered ?? per[0], 0, 200);
        }
        if (!totalLabs || labsCovered === null) bad('Fill total lab sessions and labs done, or choose "No lab".');
        if (labsCovered > totalLabs) bad('Labs done cannot be more than total lab sessions.');
      }

      let course = it.courseId ? await getCourse(int(it.courseId, 1, 1e9)!) : null;
      if (!course && it.newCourse) {
        const code = clean(it.newCourse.code).slice(0, 30);
        const name = clean(it.newCourse.name).slice(0, 120);
        const year = int(it.newCourse.yearOfStudy, 1, 7);
        if (!name || !year) bad('A new course needs a name and a year of study.');
        const cls = splitClass(it.newCourse.studentDept || teacher.department);
        const section = clean(it.newCourse.section).slice(0, 20) || cls.section;
        const studentDept = cls.dept === teacher.department ? '' : cls.dept;
        const batch = clean(it.newCourse.batch).slice(0, 20);
        const base = { academic_year: p.academicYear, semester: p.semester, department: teacher.department, code, name, batch };
        course = await findCourse({ ...base, student_dept: studentDept, section });
        if (!course) {
          const id = await insertCourse({
            ...base,
            student_dept: studentDept,
            section,
            year_of_study: year,
            crhr: num(it.newCourse.crhr),
            total_chapters: total,
            has_lab: hasLab,
            total_lab_sessions: totalLabs,
            source: 'teacher',
          });
          course = await getCourse(id);
        }
      }
      if (!course) bad('Course not found. Reload the page and try again.');

      await linkTeacher(teacher.id, course.id);
      // The course list learns chapter/lab totals from the first teacher who reports them.
      if (course.total_chapters === null) {
        await query(`update courses set total_chapters=$2, has_lab=$3, total_lab_sessions=coalesce(total_lab_sessions, $4) where id=$1`, [
          course.id,
          total,
          hasLab,
          totalLabs,
        ]);
      }

      const tags = (Array.isArray(it.tags) ? it.tags : []).map((t) => clean(t).slice(0, 40)).filter(Boolean).slice(0, 10);
      const keys = new Set(s.questions.map((x) => x.key));
      const answers = Object.fromEntries(Object.entries(parseAnswers(it.answers)).filter(([k]) => keys.has(k)));
      // "Lab class started?" follows from the lab sessions number when the teacher did not answer it.
      if (keys.has('lab') && hasLab && !answers.lab && labsCovered !== null) answers.lab = labsCovered > 0 ? 'yes' : 'no';
      saved.push(
        await insertTeacherReport({
          academic_year: p.academicYear,
          semester: p.semester,
          report_type: p.reportType,
          teacher_id: teacher.id,
          teacher_name: teacher.name,
          course_id: course.id,
          department: course.department,
          student_dept: course.student_dept,
          section: course.section,
          year_of_study: course.year_of_study,
          batch: course.batch,
          course_code: course.code,
          course_name: course.name,
          crhr: course.crhr,
          total_chapters: total,
          chapters_covered: covered,
          has_lab: hasLab,
          total_lab_sessions: totalLabs,
          labs_covered: labsCovered,
          labs_by_section: labsBySection,
          tutorials_done: int(it.tutorialsDone, 0, 200),
          answers: JSON.stringify(answers),
          tags: tags.join('; '),
          remarks: clean(it.remarks).slice(0, 500),
          review: 'pending',
          device,
        }),
      );
    }
    return ok({ ok: true, saved: saved.length });
  } catch (e) {
    return fail(e);
  }
}
