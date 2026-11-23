import { query } from '@/lib/db';
import { seedCourses } from '@/lib/seed';
import { bad, fail, ok, readJson, requireAdmin } from '@/lib/http';
import { clean, int, num } from '@/lib/normalize';
import {
  getSettings,
  insertCourse,
  listCourses,
  listPeriods,
  listStudentReports,
  listTeacherReports,
  listTeachers,
  saveSettings,
  setCourseTeachers,
  updateCourse,
  type CourseInput,
} from '@/lib/repo';
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/defaults';
import type { Period, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

function periodFrom(sp: URLSearchParams, fallback: Period): Period {
  return {
    academicYear: sp.get('ay') || fallback.academicYear,
    semester: sp.get('sem') || fallback.semester,
    reportType: sp.get('rt') || fallback.reportType,
  };
}

/** All data for one period. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const settings = await getSettings();
    const period = periodFrom(new URL(req.url).searchParams, settings.period);
    const [teachers, courses, teacherReports, studentReports, periods] = await Promise.all([
      listTeachers(),
      listCourses({ academicYear: period.academicYear, semester: period.semester }),
      listTeacherReports(period),
      listStudentReports(period),
      listPeriods(settings.period),
    ]);
    return ok({ settings, period, teachers, courses, teacherReports, studentReports, periods });
  } catch (e) {
    return fail(e);
  }
}

function courseInput(c: any, settings: Settings): CourseInput {
  const code = clean(c.code).slice(0, 30);
  const name = clean(c.name).slice(0, 120);
  const year = int(c.year_of_study, 1, 7);
  if (!name) bad('Course name is required.');
  if (!year) bad(`Year of study is missing for ${name}.`);
  const hasLab = !!c.has_lab;
  const department = clean(c.department);
  const studentDept = clean(c.student_dept).toUpperCase();
  return {
    academic_year: clean(c.academic_year) || settings.period.academicYear,
    semester: clean(c.semester) || settings.period.semester,
    department,
    student_dept: studentDept === department ? '' : studentDept,
    section: clean(c.section).slice(0, 20),
    year_of_study: year,
    batch: clean(c.batch).slice(0, 20),
    code,
    name,
    crhr: num(c.crhr),
    total_chapters: int(c.total_chapters, 1, 100),
    has_lab: hasLab,
    total_lab_sessions: hasLab ? int(c.total_lab_sessions, 1, 200) ?? settings.weeksPerSemester : null,
    students: int(c.students, 0, 100000),
    lec_hours: num(c.lec_hours),
    lab_hours: num(c.lab_hours),
    tut_hours: num(c.tut_hours),
    lec_sections: int(c.lec_sections, 0, 50),
    lab_sections: int(c.lab_sections, 0, 50),
    tut_sections: int(c.tut_sections, 0, 50),
    curriculum_semester: clean(c.curriculum_semester).slice(0, 10),
    source: clean(c.source) || 'admin',
  };
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => int(x, 1, 1e9)).filter((x): x is number => !!x) : []);

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const b = await readJson<any>(req);
    const settings = await getSettings();

    switch (b.action) {
      case 'saveSettings': {
        const s = mergeSettings(b.settings);
        s.lectureWeight = Math.min(Math.max(Number(s.lectureWeight) || DEFAULT_SETTINGS.lectureWeight, 0), 1);
        s.years = (s.years ?? []).map(Number).filter((y) => y >= 1 && y <= 7);
        s.departments = (s.departments ?? []).filter((d) => clean(d.code)).map((d) => ({ code: clean(d.code), name: clean(d.name) }));
        s.gapThreshold = Math.max(Number(s.gapThreshold) || 2, 1);
        s.weeksPerSemester = Math.min(Math.max(Number(s.weeksPerSemester) || 16, 1), 30);
        s.labGapThreshold = Math.max(Number(s.labGapThreshold) || 3, 1);
        s.questions = (Array.isArray(s.questions) ? s.questions : [])
          .map((x, i) => ({
            key: clean(x.key).toLowerCase().replace(/[^a-z0-9]/g, '') || `q${i + 1}`,
            teacher: clean(x.teacher).slice(0, 120),
            student: clean(x.student || x.teacher).slice(0, 120),
            labOnly: !!x.labOnly,
          }))
          .filter((x) => x.teacher)
          .slice(0, 10);
        return ok({ settings: await saveSettings(s) });
      }
      case 'setPeriod': {
        const p = b.period as Period;
        if (!clean(p?.academicYear) || !clean(p?.semester) || !clean(p?.reportType)) bad('Choose academic year, semester and report type.');
        settings.period = { academicYear: clean(p.academicYear), semester: clean(p.semester), reportType: clean(p.reportType) };
        return ok({ settings: await saveSettings(settings) });
      }
      case 'addTeachers': {
        const lines: { name: string; department: string }[] = Array.isArray(b.teachers) ? b.teachers : [];
        const existing = new Set((await listTeachers()).map((t) => t.name.toLowerCase()));
        let added = 0;
        for (const l of lines.slice(0, 500)) {
          const name = clean(l.name).slice(0, 80);
          if (!name || existing.has(name.toLowerCase())) continue;
          await query(`insert into teachers (name, department) values ($1, $2)`, [name, clean(l.department)]);
          existing.add(name.toLowerCase());
          added++;
        }
        return ok({ added });
      }
      case 'updateTeacher': {
        const id = int(b.id, 1, 1e9);
        const name = clean(b.name).slice(0, 80);
        if (!id || !name) bad('Name is required.');
        await query(`update teachers set name=$2, department=$3, active=$4, source=$5 where id=$1`, [
          id,
          name,
          clean(b.department),
          b.active !== false,
          clean(b.source) || 'admin',
        ]);
        await query(`update teacher_reports set teacher_name=$2 where teacher_id=$1`, [id, name]);
        return ok({ ok: true });
      }
      case 'deleteTeacher': {
        await query(`delete from teachers where id=$1`, [int(b.id, 1, 1e9)]);
        return ok({ ok: true });
      }
      case 'saveCourse': {
        const input = courseInput(b.course, settings);
        let id = int(b.course?.id, 1, 1e9);
        if (id) await updateCourse(id, input);
        else id = await insertCourse(input);
        if (Array.isArray(b.teacherIds)) await setCourseTeachers(id, ids(b.teacherIds));
        return ok({ id });
      }
      case 'addCourses': {
        const rows: any[] = Array.isArray(b.courses) ? b.courses.slice(0, 500) : [];
        const teachers = await listTeachers();
        let added = 0;
        for (const r of rows) {
          const id = await insertCourse(courseInput(r, settings));
          const tnames = clean(r.teacher)
            .split(/[,/;]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          for (const tn of tnames) {
            const t = teachers.find((x) => x.name.toLowerCase() === tn);
            if (t) await query(`insert into teacher_courses values ($1,$2) on conflict do nothing`, [t.id, id]);
          }
          added++;
        }
        return ok({ added });
      }
      case 'seedCourses': {
        return ok(await seedCourses(query, settings.weeksPerSemester));
      }
      case 'deleteCourse': {
        await query(`delete from courses where id=$1`, [int(b.id, 1, 1e9)]);
        return ok({ ok: true });
      }
      case 'setReview': {
        const table = b.kind === 'student' ? 'student_reports' : 'teacher_reports';
        const review = ['pending', 'verified', 'rejected'].includes(b.review) ? b.review : bad('Bad review value');
        const list = ids(b.ids);
        if (!list.length) bad('Nothing selected');
        await query(`update ${table} set review=$1 where id = any($2::int[])`, [review, list]);
        return ok({ ok: true });
      }
      case 'deleteReports': {
        const table = b.kind === 'student' ? 'student_reports' : 'teacher_reports';
        const list = ids(b.ids);
        if (!list.length) bad('Nothing selected');
        await query(`delete from ${table} where id = any($1::int[])`, [list]);
        return ok({ ok: true });
      }
      case 'updateTeacherReport': {
        const id = int(b.id, 1, 1e9);
        const r = b.report ?? {};
        const total = int(r.total_chapters, 1, 100);
        const cov = int(r.chapters_covered, 0, 100);
        if (!id || !total || cov === null || cov > total) bad('Check total chapters and chapters covered.');
        const hasLab = !!r.has_lab;
        await query(
          `update teacher_reports set total_chapters=$2, chapters_covered=$3, has_lab=$4, total_lab_sessions=$5, labs_covered=$6,
             remarks=$7, crhr=$8, review=$9 where id=$1`,
          [
            id,
            total,
            cov,
            hasLab,
            hasLab ? int(r.total_lab_sessions, 1, 200) : null,
            hasLab ? int(r.labs_covered, 0, 200) : null,
            clean(r.remarks).slice(0, 500),
            num(r.crhr),
            ['pending', 'verified', 'rejected'].includes(r.review) ? r.review : 'pending',
          ],
        );
        return ok({ ok: true });
      }
      default:
        bad('Unknown action');
    }
  } catch (e) {
    return fail(e);
  }
}
