import ExcelJS from 'exceljs';
import { query } from '@/lib/db';
import { bad, fail, ok, requireAdmin } from '@/lib/http';
import { clean, int, normAcademicYear, normReportType, normSemester, normYesNo, num } from '@/lib/normalize';
import { findCourse, getSettings, insertCourse, insertTeacherReport, saveSettings } from '@/lib/repo';

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

/**
 * Imports the QA_Report sheet of the Excel template: every row becomes a course in the catalogue,
 * and (optionally) its progress numbers become a verified teacher report.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get('file');
    const withReports = form.get('reports') === '1';
    if (!(file instanceof File)) bad('Choose the Excel file first.');
    if (file.size > 10 * 1024 * 1024) bad('File is too large (max 10 MB).');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await file.arrayBuffer()) as any);
    const ws = wb.getWorksheet('QA_Report') ?? wb.worksheets[0];
    if (!ws) bad('No sheet found in the file.');

    // Header row = the row whose column B says "QA Team (Dept)" (row 5 in the template).
    let header = 5;
    for (let r = 1; r <= 15; r++) {
      if (/qa team/i.test(clean(value(ws.getRow(r).getCell(2))))) {
        header = r;
        break;
      }
    }

    const settings = await getSettings();
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
      if (!department || !academic_year || !semester || !year || !code) {
        skipped++;
        problems.push(`Row ${r}: missing department, year, semester, year of study or course code`);
        continue;
      }
      if (!deptCodes.has(department)) {
        settings.departments.push({ code: department, name: department });
        deptCodes.add(department);
      }
      const hasLab = normYesNo(c(15));
      const totalCh = int(c(11), 1, 100);
      const totalLabs = hasLab ? int(c(16), 1, 200) : null;

      let course = await findCourse({ academic_year, semester, department, code, batch });
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
        course = await findCourse({ academic_year, semester, department, code, batch });
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
    return ok({ courses, reports, skipped, problems: problems.slice(0, 20) });
  } catch (e) {
    return fail(e);
  }
}
