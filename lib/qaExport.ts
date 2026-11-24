import 'server-only';
import { QA_TEMPLATE_BASE64 } from './qaTemplate';
import { XlsxTemplate, type CellValue } from './xlsxTemplate';
import { answerSummary, type Row } from './consolidate';
import { parseSections } from './normalize';
import type { Period, Settings } from './types';

/**
 * Builds QA_Course_Coverage_Report.xlsx exactly like the QA team's workbook (same sheets, columns, formulas, styles,
 * charts, drop-downs). Only cell values are written:
 *   QA_Report rows 6..505  – input columns B..L, O..Q, V; formula columns A, M, N, R, S, T, U, W, X keep their formulas
 *                            and get the result the formula gives (so systems that read values without recalculating
 *                            still see correct numbers);
 *   Course_Report          – the course picked in B4:B9 is the first exported row, results filled in;
 *   Summary                – results filled in for the "All" filters.
 * Excel recalculates everything when the file is opened.
 */

const FIRST = 6;
const LAST = 505;
export const QA_MAX_ROWS = LAST - FIRST + 1;

type In = {
  B: string; C: string; D: string; E: string; F: number | null; G: string | number | null; H: string; I: string;
  J: number | null; K: number | null; L: number | null; O: 'Yes' | 'No'; P: number | null; Q: number | null; V: string;
};
type Out = In & { A: CellValue; M: CellValue; N: CellValue; R: CellValue; S: CellValue; T: CellValue; U: CellValue; W: CellValue; X: CellValue };

const blank = (v: unknown) => v === null || v === undefined || v === '';
const n0 = (v: number | null) => (v === null ? 0 : v);
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** One QA_Report row from a course in the course report. */
export function qaInputRow(r: Row, period: Period, settings: Settings): In | null {
  const rep = r.report;
  if (!rep) return null;
  const labs = rep.has_lab;
  const per = parseSections(rep.labs_by_section);
  const notes: string[] = [];
  const answers = answerSummary(rep.answers, settings.questions);
  if (answers) notes.push(answers);
  if (per.length > 1) notes.push(`Lab sections done: ${per.join(' / ')}`);
  if (rep.tutorials_done !== null) notes.push(`Tutorials done: ${rep.tutorials_done}`);
  if (r.agreement.total) notes.push(`Students: ${r.agreement.agree} of ${r.agreement.total} agree`);
  if (rep.tags) notes.push(rep.tags);
  if (rep.remarks) notes.push(rep.remarks);
  const batch = (r.batch ?? '').trim();
  return {
    B: r.department,
    C: period.academicYear,
    D: period.semester,
    E: period.reportType,
    F: r.year_of_study,
    G: batch === '' ? null : /^\d+$/.test(batch) ? Number(batch) : batch,
    H: r.name,
    I: r.code ?? '',
    J: r.crhr,
    K: rep.total_chapters,
    L: rep.chapters_covered,
    O: labs ? 'Yes' : 'No',
    P: labs ? rep.total_lab_sessions : null,
    Q: labs ? rep.labs_covered : null,
    V: notes.join('. '),
  };
}

type Bands = { names: string[]; from: number[] };

/** Same results as the formulas in the template's columns A..X. */
function compute(rows: In[], weight: number, mid: Bands, fin: Bands): Out[] {
  const keyOf = (r: In) => (blank(r.H) ? '' : [r.B, r.C, r.D, r.E, r.I, r.G ?? ''].map((x) => String(x ?? '')).join('|'));
  const keys = rows.map(keyOf);
  const count = new Map<string, number>();
  keys.forEach((k) => count.set(k, (count.get(k) ?? 0) + 1));
  const match = (t: number, b: Bands) => {
    let idx = -1;
    b.from.forEach((f, i) => {
      if (f <= t + 1e-12) idx = i;
    });
    return idx >= 0 ? b.names[idx] : '';
  };
  return rows.map((r, i) => {
    const has = !blank(r.H);
    const M = blank(r.K) ? '' : n0(r.K) - n0(r.L);
    const N = blank(r.K) || r.K === 0 ? '' : Math.min(n0(r.L) / n0(r.K), 1);
    const R = r.O !== 'Yes' ? '' : blank(r.P) ? '' : n0(r.P) - n0(r.Q);
    const S = r.O !== 'Yes' ? '' : blank(r.P) || r.P === 0 ? '' : Math.min(n0(r.Q) / n0(r.P), 1);
    const T = N === '' ? '' : round4(S === '' ? (N as number) : (N as number) * weight + (S as number) * (1 - weight));
    const U = T === '' ? '' : match(T as number, r.E === 'Final' ? fin : mid);
    const X = keys[i];
    const W = !has
      ? ''
      : (count.get(X) ?? 0) > 1
        ? 'DUPLICATE record'
        : [r.B, r.C, r.D, r.E, r.F, r.G, r.I, r.K, r.L].some(blank)
          ? 'Incomplete'
          : r.O === 'Yes' && (blank(r.P) || blank(r.Q))
            ? 'Lab data missing'
            : 'OK';
    return { ...r, A: has ? i + 1 : '', M, N, R, S, T, U, W, X };
  });
}

export function templateBuffer(): Uint8Array {
  return Uint8Array.from(Buffer.from(QA_TEMPLATE_BASE64, 'base64'));
}

export async function buildQaWorkbook(inputs: In[]): Promise<{ buffer: Uint8Array; written: number; dropped: number }> {
  const t = await XlsxTemplate.load(templateBuffer());
  const S = 'Settings';
  const weight = Number(t.get(S, 'B10') ?? 0.7);
  const bands = (from: number, to: number): Bands => {
    const names: string[] = [];
    const fr: number[] = [];
    for (let r = from; r <= to; r++) {
      const nm = t.get(S, `A${r}`);
      const f = t.get(S, `B${r}`);
      if (nm === null || f === null) continue;
      names.push(String(nm));
      fr.push(Number(f));
    }
    return { names, from: fr };
  };
  const mid = bands(14, 20);
  const fin = bands(24, 30);

  const kept = inputs.slice(0, QA_MAX_ROWS);
  const rows = compute(kept, weight, mid, fin);

  // ---- QA_Report ----
  const qa = new Map<string, CellValue>();
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'] as const;
  for (let r = FIRST; r <= LAST; r++) {
    const row = rows[r - FIRST];
    for (const c of COLS) qa.set(`${c}${r}`, row ? ((row as any)[c] ?? null) : c === 'A' || 'MNRSTUWX'.includes(c) ? '' : null);
  }
  t.set('QA_Report', qa);

  // ---- Course_Report: show the first exported course ----
  const cr = new Map<string, CellValue>();
  const first = rows[0];
  const sel = first ? [first.B, first.C, first.D, first.E, first.I, first.G ?? ''] : ['', '', '', '', '', ''];
  ['B4', 'B5', 'B6', 'B7', 'B8', 'B9'].forEach((ref, i) => cr.set(ref, sel[i] === '' ? null : String(sel[i])));
  const key = sel.map((x) => String(x ?? '')).join('|');
  const pos = first ? rows.findIndex((x) => x.X === key) + 1 : 0;
  cr.set('B10', pos);
  cr.set('D10', pos === 0 ? 'No matching record - check the selections' : 'Record found');
  const FORMULA_COLS = new Set(['A', 'M', 'N', 'R', 'S', 'T', 'U', 'W', 'X']);
  const at = (c: keyof Out): CellValue => {
    if (pos === 0) return '';
    const v = rows[pos - 1][c] as CellValue;
    if (FORMULA_COLS.has(c as string)) return v ?? '';
    return v === null || v === undefined || v === '' ? 0 : v; // INDEX of an empty input cell gives 0 in Excel
  };
  const map: [string, keyof Out][] = [
    ['B13', 'H'], ['E13', 'I'], ['B14', 'B'], ['E14', 'F'], ['B15', 'C'], ['E15', 'D'], ['B16', 'E'], ['E16', 'G'], ['B17', 'J'],
    ['B20', 'K'], ['E20', 'L'], ['B21', 'M'], ['E21', 'N'], ['B24', 'O'], ['E24', 'P'], ['B25', 'Q'], ['E25', 'R'], ['B26', 'S'],
    ['B29', 'T'], ['E29', 'U'],
  ];
  for (const [ref, c] of map) cr.set(ref, at(c));
  const numOr0 = (v: CellValue) => (typeof v === 'number' ? v : 0);
  cr.set('B34', numOr0(cr.get('E21') ?? null));
  cr.set('B35', numOr0(cr.get('B26') ?? null));
  cr.set('B36', numOr0(cr.get('B29') ?? null));
  t.set('Course_Report', cr);

  // ---- Summary (filters are "All") ----
  const sm = new Map<string, CellValue>();
  const depts = [9, 10, 11].map((r) => String(t.get('Summary', `A${r}`) ?? ''));
  const statusCols = ['F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const statusNames = statusCols.map((c) => String(t.get('Summary', `${c}8`) ?? ''));
  const years = ['B', 'C', 'D', 'E'].map((c) => Number(t.get('Summary', `${c}15`)));
  const isText = (v: unknown) => typeof v === 'string' && v !== '';
  const inScope = (x: Out, dept: string | null) =>
    isText(x.H) && isText(x.C) && isText(x.D) && isText(x.E) && (dept === null ? isText(x.B) : x.B === dept);
  const avg = (xs: CellValue[]): CellValue => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : '-';
  };
  const fill = (rowNum: number, dept: string | null) => {
    const sub = rows.filter((x) => inScope(x, dept));
    sm.set(`B${rowNum}`, sub.length);
    sm.set(`C${rowNum}`, avg(sub.map((x) => x.N)));
    sm.set(`D${rowNum}`, avg(sub.map((x) => x.S)));
    sm.set(`E${rowNum}`, avg(sub.map((x) => x.T)));
    statusCols.forEach((c, i) => sm.set(`${c}${rowNum}`, sub.filter((x) => x.U === statusNames[i]).length));
  };
  depts.forEach((d, i) => fill(9 + i, d));
  fill(12, null);
  const fillYears = (rowNum: number, dept: string | null) =>
    ['B', 'C', 'D', 'E'].forEach((c, i) => sm.set(`${c}${rowNum}`, avg(rows.filter((x) => inScope(x, dept) && x.F === years[i]).map((x) => x.T))));
  depts.forEach((d, i) => fillYears(16 + i, d));
  fillYears(19, null);
  t.set('Summary', sm);

  return { buffer: await t.toBuffer(), written: kept.length, dropped: inputs.length - kept.length };
}
