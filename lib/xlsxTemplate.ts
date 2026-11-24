import 'server-only';
import JSZip from 'jszip';

/**
 * Minimal "fill an existing .xlsx" engine. It edits cell values directly in the sheet XML so that everything else in
 * the template (styles, charts, data validation, conditional formatting, formulas, sheet order) stays byte-for-byte.
 *
 * - Formula cells keep their formula; only the cached result (<v>) is replaced.
 * - Plain cells get the new value (strings go into sharedStrings, like Excel writes them).
 * - null = empty cell (the style is kept).
 */
export type CellValue = string | number | null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const colNum = (col: string) => col.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

class SharedStrings {
  items: string[]; // raw <si>…</si> xml
  texts: string[];
  index = new Map<string, number>();
  constructor(private xml: string) {
    this.items = xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? [];
    this.texts = this.items.map((si) => unesc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<t[^>]*>|<\/t>/g, '')).join('')));
    this.texts.forEach((t, i) => {
      if (!this.index.has(t)) this.index.set(t, i);
    });
  }
  get(i: number) {
    return this.texts[i] ?? '';
  }
  add(text: string) {
    const found = this.index.get(text);
    if (found !== undefined) return found;
    const i = this.items.length;
    this.items.push(`<si><t xml:space="preserve">${esc(text)}</t></si>`);
    this.texts.push(text);
    this.index.set(text, i);
    return i;
  }
  /** Rebuilds the table keeping only used strings; returns old->new index map. */
  compact(used: Set<number>) {
    const map = new Map<number, number>();
    const items: string[] = [];
    [...used].sort((a, b) => a - b).forEach((old) => {
      map.set(old, items.length);
      items.push(this.items[old]);
    });
    this.items = items;
    return map;
  }
  toXml(totalRefs: number) {
    const head = this.xml.slice(0, this.xml.indexOf('<sst'));
    const sstTag = (this.xml.match(/<sst[^>]*>/)?.[0] ?? '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
      .replace(/\s(count|uniqueCount)="\d+"/g, '')
      .replace(/>$/, ` count="${totalRefs}" uniqueCount="${this.items.length}">`);
    return `${head}${sstTag}${this.items.join('')}</sst>`;
  }
}

type Cell = { col: string; row: number; attrs: string; inner: string | null };
const CELL_RE = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function parseCells(rowXml: string): Cell[] {
  const out: Cell[] = [];
  for (const m of rowXml.matchAll(CELL_RE)) out.push({ col: m[1], row: Number(m[2]), attrs: m[3], inner: m[4] ?? null });
  return out;
}

function cellXml(c: Cell): string {
  return c.inner === null ? `<c r="${c.col}${c.row}"${c.attrs}/>` : `<c r="${c.col}${c.row}"${c.attrs}>${c.inner}</c>`;
}

function withValue(c: Cell, v: CellValue, sst: SharedStrings): Cell {
  const style = c.attrs.match(/\ss="\d+"/)?.[0] ?? '';
  const formula = c.inner?.match(/<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>/)?.[0];
  if (formula) {
    if (v === null || v === '') return { ...c, attrs: `${style} t="str"`, inner: `${formula}<v/>` };
    if (typeof v === 'number') return { ...c, attrs: style, inner: `${formula}<v>${num(v)}</v>` };
    return { ...c, attrs: `${style} t="str"`, inner: `${formula}<v>${esc(v)}</v>` };
  }
  if (v === null || v === '') return { ...c, attrs: style, inner: null };
  if (typeof v === 'number') return { ...c, attrs: style, inner: `<v>${num(v)}</v>` };
  return { ...c, attrs: `${style} t="s"`, inner: `<v>${sst.add(v)}</v>` };
}

/** Writing a file must not add folder entries the original package does not have. */
const NO_FOLDERS = { createFolders: false } as const;

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e12) / 1e12));

export class XlsxTemplate {
  private constructor(
    private zip: JSZip,
    private sst: SharedStrings,
    private sheetPaths: Map<string, string>,
    private sheets: Map<string, string>,
  ) {}

  static async load(buf: ArrayBuffer | Uint8Array): Promise<XlsxTemplate> {
    const zip = await JSZip.loadAsync(buf, { createFolders: false });
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const sstXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></sst>';
    const relTarget = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    // Some writers put Target before Id
    for (const m of rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) relTarget.set(m[2], m[1]);
    const sheetPaths = new Map<string, string>();
    for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const target = relTarget.get(m[2]);
      if (target) sheetPaths.set(unesc(m[1]), target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
    const sheets = new Map<string, string>();
    for (const [name, p] of sheetPaths) sheets.set(name, await zip.file(p)!.async('string'));
    return new XlsxTemplate(zip, new SharedStrings(sstXml), sheetPaths, sheets);
  }

  /** Reads a cell's value (cached result for formulas). */
  get(sheet: string, ref: string): CellValue {
    const xml = this.sheets.get(sheet);
    if (!xml) return null;
    const i = xml.indexOf(`<c r="${ref}"`);
    if (i < 0) return null;
    const m = new RegExp(CELL_RE.source).exec(xml.slice(i, i + 20000));
    if (!m || m[4] === undefined) return null;
    const v = m[4].match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (v === undefined) {
      const inline = m[4].match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      return inline !== undefined ? unesc(inline) : null;
    }
    const t = m[3].match(/\st="(\w+)"/)?.[1];
    if (t === 's') return this.sst.get(Number(v));
    if (t === 'str' || t === 'inlineStr' || t === 'e') return unesc(v);
    if (t === 'b') return Number(v);
    return v === '' ? null : Number(v);
  }

  /** Sets many cells of one sheet at once. Keys are refs like "B6". */
  set(sheet: string, values: Map<string, CellValue>) {
    const xml = this.sheets.get(sheet);
    if (!xml) throw new Error(`Sheet ${sheet} not found in template`);
    const byRow = new Map<number, Map<string, CellValue>>();
    for (const [ref, v] of values) {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const r = Number(m[2]);
      if (!byRow.has(r)) byRow.set(r, new Map());
      byRow.get(r)!.set(m[1], v);
    }
    const start = xml.indexOf('<sheetData>');
    const end = xml.indexOf('</sheetData>');
    if (start < 0 || end < 0) throw new Error(`Sheet ${sheet} has no data`);
    let body = xml.slice(start + '<sheetData>'.length, end);
    body = body.replace(/<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (whole, rStr: string, rAttrs: string, inner?: string) => {
      const r = Number(rStr);
      const edits = byRow.get(r);
      if (!edits) return whole;
      byRow.delete(r);
      const cells = parseCells(inner ?? '');
      for (const [col, v] of edits) {
        const i = cells.findIndex((c) => c.col === col);
        if (i >= 0) cells[i] = withValue(cells[i], v, this.sst);
        else if (v !== null && v !== '') cells.push(withValue({ col, row: r, attrs: '', inner: null }, v, this.sst));
      }
      cells.sort((a, b) => colNum(a.col) - colNum(b.col));
      return `<row r="${r}"${rAttrs}>${cells.map(cellXml).join('')}</row>`;
    });
    // Rows that did not exist yet (not expected with the QA template, but handled).
    if (byRow.size) {
      const extra = [...byRow.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([r, edits]) => {
          const cells = [...edits]
            .filter(([, v]) => v !== null && v !== '')
            .map(([col, v]) => withValue({ col, row: r, attrs: '', inner: null }, v, this.sst))
            .sort((a, b) => colNum(a.col) - colNum(b.col));
          return `<row r="${r}">${cells.map(cellXml).join('')}</row>`;
        });
      body += extra.join('');
    }
    this.sheets.set(sheet, xml.slice(0, start) + '<sheetData>' + body + xml.slice(end));
  }

  /** Writes the workbook. Unused shared strings are dropped; Excel is told to recalculate on open. */
  async toBuffer(): Promise<Uint8Array> {
    // Compact shared strings so nothing from the template's old data is left behind.
    const used = new Set<number>();
    let refs = 0;
    for (const xml of this.sheets.values()) {
      for (const m of xml.matchAll(/<c r="[A-Z]+\d+"[^>]*?\st="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
        used.add(Number(m[1]));
        refs++;
      }
    }
    const map = this.sst.compact(used);
    for (const [name, xml] of this.sheets) {
      const remapped = xml.replace(/(<c r="[A-Z]+\d+"[^>]*?\st="s"[^>]*>\s*<v>)(\d+)(<\/v>)/g, (_w, a: string, i: string, b: string) => `${a}${map.get(Number(i))}${b}`);
      this.zip.file(this.sheetPaths.get(name)!, remapped, NO_FOLDERS);
    }
    if (this.zip.file('xl/sharedStrings.xml')) this.zip.file('xl/sharedStrings.xml', this.sst.toXml(refs), NO_FOLDERS);
    const core = await this.zip.file('docProps/core.xml')?.async('string');
    if (core) {
      this.zip.file(
        'docProps/core.xml',
        core
          .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>QA Coverage Tracker</cp:lastModifiedBy>')
          .replace(/(<dcterms:modified[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}$2`),
        NO_FOLDERS,
      );
    }
    const wb = await this.zip.file('xl/workbook.xml')!.async('string');
    this.zip.file(
      'xl/workbook.xml',
      /fullCalcOnLoad=/.test(wb) ? wb : wb.replace(/<calcPr([^>]*?)(\/?)>/, '<calcPr$1 fullCalcOnLoad="1"$2>'),
      NO_FOLDERS,
    );
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
}
