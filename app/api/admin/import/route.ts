import ExcelJS from 'exceljs';
import { query } from '@/lib/db';
import { bad, fail, ok, requireAdmin } from '@/lib/http';
import { clean, int, normAcademicYear, normReportType, normSemester, normYesNo, num, splitClass } from '@/lib/normalize';
import {
  findCourse,
  findOrCreateTeacher,
  getSettings,
  insertCourse,
  insertTeacherReport,
  linkTeacher,
  listTeachers,
  saveSettings,
  updateCourse,
} from '@/lib/repo';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

function value(cell: ExcelJS.Cell): unknown {
  const v = cell.value as any;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return v.result ?? null;
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

const text = (ws: ExcelJS.Worksheet, r: number, c: number) => clean(value(ws.getRow(r).getCell(c)));

/** Finds the first row (in the first 20) that has a cell matching `re`; returns [row, col]. */
function findCell(ws: ExcelJS.Worksheet, re: RegExp): [number, number] | null {
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(40, ws.columnCount || 40); c++) {
      if (re.test(clean(value(row.getCell(c))))) return [r, c];
    }
  }
  return null;
}

/**
 * Two layouts are accepted:
 *  1. Course offering (department file: Ins. Name | Course Title | Students Dep.t | # of Students | Class Year | Sem | Cr. Hr | Hours for Lec/Lab/Tut | No. of Sections Lec/Lab/Tut)
 *     → teachers, courses and who teaches what.
 *  2. The QA_Report sheet of the QA workbook → courses and (optionally) their reported progress.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) bad('Choose the Excel file first.');
    if (file.size > 10 * 1024 * 1024) bad('File is too large (max 10 MB).');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await file.arrayBuffer()) as any);
    const settings = await getSettings();

    for (const ws of wb.worksheets) {
      if (findCell(ws, /^ins\.?\s*name|^instructor/i)) return ok(await importOffering(ws, form, settings));
    }
    const ws = wb.getWorksheet('QA_Report') ?? wb.worksheets[0];
    if (!ws) bad('No sheet found in the file.');
    return ok(await importQaReport(ws, form.get('reports') === '1', settings));
  } catch (e) {
    return fail(e);
  }
}

// ---------------- course offering ----------------
async function importOffering(ws: ExcelJS.Worksheet, form: FormData, settings: Settings) {
  const [h, instCol] = findCell(ws, /^ins\.?\s*name|^instructor/i)!;
  const col = (re: RegExp) => {
    for (let c = 1; c <= Math.min(40, ws.columnCount || 40); c++) if (re.test(text(ws, h, c))) return c;
    return 0;
  };
  const titleCol = col(/course\s*title|course\s*name/i);
  const studCol = col(/student.*dep|dep.*student/i);
  const countCol = col(/#|of\s*students/i);
  const yearCol = col(/class\s*year|^year/i);
  const semCol = col(/^sem/i);
  const crCol = col(/cr\.?\s*hr|credit/i);
  const hoursCol = col(/hours\s*for|contact\s*hour/i);
  const secCol = col(/sections?/i);
  if (!titleCol || !yearCol) bad('Could not find the "Course Title" and "Class Year" columns.');

  // Period and department from the title rows, e.g. "Course offering for 2019 E.c Semester I", "Department of Software Engineering".
  let academicYear = clean(form.get('academicYear'));
  let semester = clean(form.get('semester'));
  let department = clean(form.get('department'));
  for (let r = 1; r < h; r++) {
    for (let c = 1; c <= 5; c++) {
      const t = text(ws, r, c);
      if (!t) continue;
      if (/offering/i.test(t)) {
        const y = t.match(/(\d{4})/);
        if (!academicYear && y) academicYear = `${y[1]} E.C.`;
        const sm = t.match(/semester\s*([IVX12l]+)/i);
        if (!semester && sm) semester = normSemester(sm[1]);
      }
      if (!department && /depart\s*ment|department/i.test(t)) {
        const name = t.replace(/.*depart\s*ment\s*(of)?/i, '').replace(/\s+/g, '').toLowerCase();
        const d = settings.departments.find((x) => x.name.replace(/\s+/g, '').toLowerCase() === name || x.code.toLowerCase() === name);
        if (d) department = d.code;
      }
    }
  }
  academicYear ||= settings.period.academicYear;
  semester ||= settings.period.semester;
  if (!department) bad('Could not tell which department this file is for. Choose it in the import box and try again.');

  const before = (await listTeachers()).length;
  let added = 0,
    updated = 0,
    skipped = 0;
  const problems: string[] = [];
  let instructor = '';

  for (let r = h + 2; r <= ws.rowCount; r++) {
    const inst = text(ws, r, instCol);
    const title = text(ws, r, titleCol);
    if (/batch\s*advis|assigned\s*instructor/i.test(`${inst} ${title}`)) break;
    if (inst) instructor = inst;
    if (!title) continue;
    const year = int(value(ws.getRow(r).getCell(yearCol)), 1, 7);
    if (!year) {
      skipped++;
      problems.push(`Row ${r}: "${title}" has no class year`);
      continue;
    }
    const cls = splitClass(studCol ? text(ws, r, studCol) : department);
    const studentDept = cls.dept && cls.dept !== department ? cls.dept : '';
    const n = (c: number, off = 0) => (c ? num(value(ws.getRow(r).getCell(c + off))) : null);
    const labHours = n(hoursCol, 1);
    const labSections = n(secCol, 1);
    const hasLab = (labHours ?? 0) > 0;

    const offering = {
      students: int(n(countCol), 0, 100000),
      crhr: n(crCol),
      lec_hours: n(hoursCol, 0),
      lab_hours: labHours,
      tut_hours: n(hoursCol, 2),
      lec_sections: int(n(secCol, 0), 0, 50),
      lab_sections: int(labSections, 0, 50),
      tut_sections: int(n(secCol, 2), 0, 50),
      curriculum_semester: semCol ? text(ws, r, semCol) : '',
      has_lab: hasLab,
    };

    const existing = await findCourse({ academic_year: academicYear, semester, department, code: '', name: title, student_dept: studentDept, section: cls.section });
    let courseId: number;
    if (existing) {
      const { id, teacher_ids, ...rest } = existing;
      void teacher_ids;
      await updateCourse(id, {
        ...rest,
        ...offering,
        year_of_study: year,
        total_lab_sessions: hasLab ? rest.total_lab_sessions ?? settings.weeksPerSemester : null,
      });
      courseId = id;
      updated++;
    } else {
      courseId = await insertCourse({
        academic_year: academicYear,
        semester,
        department,
        student_dept: studentDept,
        section: cls.section,
        year_of_study: year,
        code: '',
        name: title,
        total_lab_sessions: hasLab ? settings.weeksPerSemester : null,
        source: 'import',
        ...offering,
      });
      added++;
    }
    if (instructor) {
      const t = await findOrCreateTeacher(instructor, department, 'import');
      await linkTeacher(t.id, courseId);
    } else {
      problems.push(`Row ${r}: "${title}" has no instructor`);
    }
  }

  const teachers = (await listTeachers()).length - before;
  return {
    format: 'offering',
    period: `${academicYear}, ${semester}`,
    department,
    courses: added,
    updated,
    teachers,
    reports: 0,
    skipped,
    problems: problems.slice(0, 20),
  };
}

// ---------------- old QA_Report sheet ----------------
async function importQaReport(ws: ExcelJS.Worksheet, withReports: boolean, settings: Settings) {
  // Header row = the row whose column B says "QA Team (Dept)" (row 5 in the template).
  let header = 5;
  for (let r = 1; r <= 15; r++) {
    if (/qa team/i.test(text(ws, r, 2))) {
      header = r;
      break;
    }
  }

  const deptCodes = new Set(settings.departments.map((d) => d.code));
  let courses = 0,
    reports = 0,
    skipped = 0;
  const problems: string[] = [];

  for (let r = header + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c = (i: number) => value(row.getCell(i));
    const name = clean(c(8));
    const code = clean(c(9));
    if (!name && !code) continue;

    const department = clean(c(2)).toUpperCase();
    const academic_year = normAcademicYear(c(3));
    const semester = normSemester(c(4));
    const report_type = normReportType(c(5));
    const year = int(c(6), 1, 7);
    const batch = clean(c(7));
    if (!department || !academic_year || !semester || !year || !(code || name)) {
      skipped++;
      problems.push(`Row ${r}: missing department, year, semester, year of study or course`);
      continue;
    }
    if (!deptCodes.has(department)) {
      settings.departments.push({ code: department, name: department });
      deptCodes.add(department);
    }
    const hasLab = normYesNo(c(15));
    const totalCh = int(c(11), 1, 100);
    const totalLabs = hasLab ? int(c(16), 1, 200) : null;

    let course = await findCourse({ academic_year, semester, department, code, name, batch });
    if (!course) {
      await insertCourse({
        academic_year,
        semester,
        department,
        year_of_study: year,
        batch,
        code,
        name: name || code,
        crhr: num(c(10)),
        total_chapters: totalCh,
        has_lab: hasLab,
        total_lab_sessions: totalLabs,
        source: 'import',
      });
      course = await findCourse({ academic_year, semester, department, code, name, batch });
      courses++;
    }

    const covered = int(c(12), 0, 100);
    if (withReports && course && covered !== null && report_type) {
      const exists = await query(
        `select 1 from teacher_reports where course_id=$1 and academic_year=$2 and semester=$3 and report_type=$4 and teacher_name=$5 limit 1`,
        [course.id, academic_year, semester, report_type, 'Imported from Excel'],
      );
      if (!exists.length) {
        await insertTeacherReport({
          academic_year,
          semester,
          report_type,
          teacher_id: null,
          teacher_name: 'Imported from Excel',
          course_id: course.id,
          department,
          student_dept: course.student_dept,
          section: course.section,
          year_of_study: year,
          batch,
          course_code: course.code,
          course_name: course.name,
          crhr: course.crhr,
          total_chapters: totalCh,
          chapters_covered: covered,
          has_lab: hasLab,
          total_lab_sessions: totalLabs,
          labs_covered: hasLab ? int(c(17), 0, 200) : null,
          labs_by_section: '',
          tutorials_done: null,
          answers: '',
          tags: '',
          remarks: clean(c(22)).slice(0, 500),
          review: 'verified',
          device: 'excel-import',
        });
        reports++;
      }
    }
  }
  await saveSettings(settings);
  return { format: 'qa', courses, updated: 0, teachers: 0, reports, skipped, problems: problems.slice(0, 20) };
}
