/** Helpers that clean up the typing differences seen in the Excel file (e.g. "semester ll", "2019E.C", " ITec3093"). */

export const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/** "ITec 3041", "itec3041", " ITec-3041" -> "ITEC3041" (used only for matching, never shown). */
export const codeKey = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const nameKey = (v: unknown): string => clean(v).toLowerCase();

/** Identity of a course: its code when there is one, otherwise its title (the offering file has no codes). */
export const courseKey = (code: unknown, name: unknown): string => {
  const c = codeKey(code);
  return c ? c : `N:${String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
};

/** "IE [Sec 1]" -> { dept: "IE", section: "Sec 1" };  "SE" -> { dept: "SE", section: "" } */
export function splitClass(v: unknown): { dept: string; section: string } {
  const raw = clean(v);
  const m = raw.match(/^([A-Za-z]+)\s*[\[(]?\s*(sec(?:tion)?\.?\s*\w+)?\s*[\])]?/i);
  if (!m) return { dept: raw.toUpperCase(), section: '' };
  const sec = m[2] ? m[2].replace(/^sec(?:tion)?\.?\s*/i, 'Sec ') : '';
  return { dept: m[1].toUpperCase(), section: sec };
}

/** Departments students can pick: QA team departments plus every class that takes a course (e.g. IE). */
export function studentDepartments(deptCodes: string[], courses: { department: string; student_dept?: string }[]): string[] {
  return [...new Set([...deptCodes, ...courses.map((c) => c.student_dept || c.department)].filter(Boolean))];
}

/** "8|6" -> [8, 6] */
export const parseSections = (v: unknown): number[] =>
  String(v ?? '')
    .split('|')
    .map((x) => x.trim())
    .filter((x) => x !== '' && Number.isFinite(Number(x)))
    .map(Number);

/** Class label shown to people: "IE Sec 1" or "SE". */
export const classLabel = (c: { department: string; student_dept?: string; section?: string }) =>
  [c.student_dept || c.department, c.section].filter(Boolean).join(' ');

export function normSemester(v: unknown): string {
  const raw = clean(v);
  const t = raw.toLowerCase().replace(/semester|sem\.?/g, '').replace(/\s+/g, '');
  if (/^(ii|ll|il|li|2|2nd|second)$/.test(t)) return 'Semester II';
  if (/^(i|l|1|1st|first)$/.test(t)) return 'Semester I';
  return raw;
}

export function normAcademicYear(v: unknown): string {
  const raw = clean(v);
  const m = raw.match(/(\d{4})/);
  return m ? `${m[1]} E.C.` : raw;
}

export function normReportType(v: unknown): string {
  const t = clean(v).toLowerCase();
  if (t.startsWith('mid')) return 'Mid-term';
  if (t.startsWith('fin')) return 'Final';
  return clean(v);
}

export function normYesNo(v: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(clean(v));
}

/** Integer in [min, max] or null. */
export function int(v: unknown, min = 0, max = 1000): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
