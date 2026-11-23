import ExcelJS from 'exceljs';
import { consolidate, summarize, summarizeTeachers } from '@/lib/consolidate';
import { fail, requireAdmin } from '@/lib/http';
import { getSettings, listCourses, listStudentReports, listTeacherReports, listTeachers } from '@/lib/repo';
import { isFinal, score } from '@/lib/scoring';
import type { Period } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
  row.eachCell((c) => (c.fill = HEADER_FILL));
}

function addTable(ws: ExcelJS.Worksheet, headers: { h: string; w?: number; pct?: boolean }[], rows: unknown[][], startRow = 1) {
  const head = ws.getRow(startRow);
  headers.forEach((col, i) => {
    head.getCell(i + 1).value = col.h;
    ws.getColumn(i + 1).width = col.w ?? 14;
    if (col.pct) ws.getColumn(i + 1).numFmt = '0.0%';
  });
  styleHeader(head);
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    r.forEach((v, j) => (row.getCell(j + 1).value = (v ?? null) as ExcelJS.CellValue));
  });
  ws.views = [{ state: 'frozen', ySplit: startRow }];
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: headers.length } };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const settings = await getSettings();
    const sp = new URL(req.url).searchParams;
    const period: Period = {
      academicYear: sp.get('ay') || settings.period.academicYear,
      semester: sp.get('sem') || settings.period.semester,
      reportType: sp.get('rt') || settings.period.reportType,
    };
    const [teachers, courses, teacherReports, studentReports] = await Promise.all([
      listTeachers(),
      listCourses({ academicYear: period.academicYear, semester: period.semester }),
      listTeacherReports(period),
      listStudentReports(period),
    ]);
    const rows = consolidate({ period, settings, courses, teachers, teacherReports, studentReports });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'QA Coverage Tracker';

    // 1) QA_Report — same column order as the Excel template (A..W), plus extra columns at the end.
    const qa = wb.addWorksheet('QA_Report');
    qa.getCell('A1').value = `${settings.schoolName} - QA Course Coverage Report (${period.reportType}) — ${period.academicYear}, ${period.semester}`;
    qa.getCell('A1').font = { bold: true, size: 14 };
    qa.getCell('A2').value = `Exported ${new Date().toLocaleString('en-GB')}. Uses the latest verified teacher report per course (or latest pending if none is verified).`;
    qa.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
    addTable(
      qa,
      [
        { h: 'No.', w: 6 },
        { h: 'QA Team (Dept)', w: 9 },
        { h: 'Academic Year (E.C.)', w: 12 },
        { h: 'Semester', w: 12 },
        { h: 'Report Type', w: 10 },
        { h: 'Year of Study', w: 8 },
        { h: 'Batch', w: 8 },
        { h: 'Course Name', w: 34 },
        { h: 'Course Code', w: 12 },
        { h: 'Total CrHr', w: 8 },
        { h: 'Total Chapters', w: 9 },
        { h: 'Chapters Covered', w: 9 },
        { h: 'Chapters Remaining', w: 9 },
        { h: 'Lecture Coverage %', w: 10, pct: true },
        { h: 'Lab Available?', w: 8 },
        { h: 'Total Lab Sessions', w: 9 },
        { h: 'Labs Covered', w: 9 },
        { h: 'Labs Remaining', w: 9 },
        { h: 'Lab Coverage %', w: 10, pct: true },
        { h: 'Performance Rate (Overall Coverage %)', w: 13, pct: true },
        { h: 'Status', w: 30 },
        { h: 'Remarks', w: 40 },
        { h: 'Data Check', w: 16 },
        { h: 'Instructor', w: 24 },
        { h: 'Student Reports', w: 9 },
        { h: "Students' Median Chapters", w: 11 },
        { h: 'Review', w: 10 },
        { h: 'Flags', w: 40 },
      ],
      rows.map((r, i) => {
        const rep = r.report;
        const s = r.score;
        return [
          i + 1,
          r.department,
          period.academicYear,
          period.semester,
          period.reportType,
          r.year_of_study,
          r.batch,
          r.name,
          r.code,
          r.crhr,
          rep?.total_chapters ?? r.course?.total_chapters ?? null,
          rep?.chapters_covered ?? null,
          s?.chaptersRemaining ?? null,
          s?.lecture ?? null,
          rep ? (rep.has_lab ? 'Yes' : 'No') : r.course ? (r.course.has_lab ? 'Yes' : 'No') : null,
          rep?.has_lab ? rep.total_lab_sessions : null,
          rep?.has_lab ? rep.labs_covered : null,
          s?.labsRemaining ?? null,
          s?.lab ?? null,
          s?.rate ?? null,
          s?.status || (rep ? '' : 'Not reported'),
          [rep?.tags, rep?.remarks].filter(Boolean).join('. '),
          r.check || (rep ? '' : 'No report'),
          r.teacherNames,
          r.students.length,
          r.studentMedianChapters,
          rep?.review ?? '',
          r.flags.map((f) => f.label).join('; '),
        ];
      }),
      4,
    );

    // 2) By teacher
    const bt = wb.addWorksheet('By_Teacher');
    addTable(
      bt,
      [
        { h: 'Teacher', w: 28 },
        { h: 'Dept', w: 8 },
        { h: 'Courses', w: 9 },
        { h: 'Reported', w: 9 },
        { h: 'Avg Performance', w: 12, pct: true },
        { h: 'Open Flags', w: 9 },
        { h: 'Last Report', w: 20 },
      ],
      summarizeTeachers(rows, teachers).map((t) => [
        t.name,
        t.department,
        t.courses,
        t.reported,
        t.avgRate,
        t.flags,
        t.lastReport ? new Date(t.lastReport) : null,
      ]),
    );
    bt.getColumn(7).numFmt = 'yyyy-mm-dd hh:mm';

    // 3) Summary by department (like the Summary sheet)
    const sm = wb.addWorksheet('Summary');
    const bands = isFinal(period.reportType) ? settings.finalBands : settings.midBands;
    addTable(
      sm,
      [
        { h: 'Department', w: 14 },
        { h: 'Courses Reported', w: 10 },
        { h: 'Avg Lecture Coverage', w: 11, pct: true },
        { h: 'Avg Lab Coverage', w: 11, pct: true },
        { h: 'Avg Performance Rate', w: 11, pct: true },
        ...bands.map((b) => ({ h: b.name, w: 14 })),
      ],
      summarize(rows, settings, isFinal(period.reportType)).map((d) => [
        d.department === 'All' ? 'All Departments' : d.department,
        d.reported,
        d.avgLecture,
        d.avgLab,
        d.avgRate,
        ...bands.map((b) => d.statusCounts[b.name] ?? 0),
      ]),
    );

    // 4) Raw teacher submissions (including duplicates and rejected ones)
    const ts = wb.addWorksheet('Teacher_Submissions');
    addTable(
      ts,
      [
        { h: 'ID', w: 6 },
        { h: 'Submitted', w: 18 },
        { h: 'Teacher', w: 24 },
        { h: 'Dept', w: 7 },
        { h: 'Year', w: 6 },
        { h: 'Batch', w: 8 },
        { h: 'Course Code', w: 12 },
        { h: 'Course Name', w: 30 },
        { h: 'Total Ch', w: 8 },
        { h: 'Covered', w: 8 },
        { h: 'Lab?', w: 6 },
        { h: 'Total Labs', w: 8 },
        { h: 'Labs Covered', w: 8 },
        { h: 'Performance', w: 11, pct: true },
        { h: 'Status', w: 26 },
        { h: 'Quick notes', w: 30 },
        { h: 'Remarks', w: 30 },
        { h: 'Review', w: 10 },
      ],
      teacherReports.map((r) => {
        const s = score(r, settings);
        return [
          r.id,
          new Date(r.created_at),
          r.teacher_name,
          r.department,
          r.year_of_study,
          r.batch,
          r.course_code,
          r.course_name,
          r.total_chapters,
          r.chapters_covered,
          r.has_lab ? 'Yes' : 'No',
          r.total_lab_sessions,
          r.labs_covered,
          s.rate,
          s.status,
          r.tags,
          r.remarks,
          r.review,
        ];
      }),
    );
    ts.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';

    // 5) Raw student submissions
    const ss = wb.addWorksheet('Student_Submissions');
    addTable(
      ss,
      [
        { h: 'ID', w: 6 },
        { h: 'Submitted', w: 18 },
        { h: 'Student', w: 24 },
        { h: 'Dept', w: 7 },
        { h: 'Year', w: 6 },
        { h: 'Semester', w: 12 },
        { h: 'Course Code', w: 12 },
        { h: 'Course Name', w: 30 },
        { h: 'Chapters Covered', w: 10 },
        { h: 'Labs Covered', w: 10 },
        { h: 'Comment', w: 30 },
        { h: 'Review', w: 10 },
      ],
      studentReports.map((r) => [
        r.id,
        new Date(r.created_at),
        r.student_name,
        r.department,
        r.year_of_study,
        r.semester,
        r.course_code,
        r.course_name,
        r.chapters_covered,
        r.labs_covered,
        r.comment,
        r.review,
      ]),
    );
    ss.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';

    const buf = await wb.xlsx.writeBuffer();
    const fname = `QA_Coverage_${period.academicYear}_${period.semester}_${period.reportType}.xlsx`.replace(/[^\w.\-]+/g, '_');
    return new Response(buf as ArrayBuffer, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fname}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return fail(e);
  }
}
