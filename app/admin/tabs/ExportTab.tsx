'use client';

import { useMemo, useState } from 'react';
import { periodLabel } from '@/lib/client';
import { useAdmin } from '../shared';

/**
 * Export screen: checks what the QA workbook needs (course code, batch, no duplicate keys), lets the admin fix it in
 * place, then downloads the workbook in the exact QA format.
 */
export default function ExportTab() {
  const { data, rows, act, toast, goto } = useAdmin();
  const p = data.period;
  const q = `ay=${encodeURIComponent(p.academicYear)}&sem=${encodeURIComponent(p.semester)}&rt=${encodeURIComponent(p.reportType)}`;
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [batches, setBatches] = useState<Record<string, string>>({});

  const exported = rows.filter((r) => r.report);
  const notReported = rows.filter((r) => !r.report && r.course);
  const missingCode = exported.filter((r) => !r.code && r.course);
  const missingBatch = useMemo(() => {
    const m = new Map<string, { department: string; year: number; count: number }>();
    for (const r of exported.filter((x) => !x.batch && x.year_of_study)) {
      const k = `${r.department}|${r.year_of_study}`;
      const cur = m.get(k) ?? { department: r.department, year: r.year_of_study!, count: 0 };
      cur.count++;
      m.set(k, cur);
    }
    return [...m.entries()];
  }, [exported]);
  const keyCount = new Map<string, number>();
  for (const r of exported) {
    const k = [r.department, p.academicYear, p.semester, p.reportType, r.code, r.batch].join('|');
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const dupKeys = exported.filter((r) => (keyCount.get([r.department, p.academicYear, p.semester, p.reportType, r.code, r.batch].join('|')) ?? 0) > 1);
  const pending = exported.filter((r) => r.report?.review === 'pending').length;
  const ready = !missingCode.length && !missingBatch.length && !dupKeys.length;

  return (
    <div className="stack-lg" style={{ maxWidth: 980 }}>
      <div className="card stack">
        <h2>Export — {periodLabel(p)}</h2>
        <p className="small muted">
          The QA workbook is your <b>QA_Course_Coverage_Report.xlsx</b> exactly: the same 5 sheets (Instructions, QA_Report, Course_Report,
          Summary, Settings), the same columns A–X, formulas, drop-downs, colours and charts. One row per course is written from row 6,
          using the report you verified (or the <b>first</b> report sent if none is verified). Later submissions never replace it.
        </p>
        <div className="kpis">
          <div className="card tight kpi">
            <div className="v">{exported.length}</div>
            <div className="l">rows will be exported</div>
          </div>
          <div className="card tight kpi">
            <div className="v" style={{ color: notReported.length ? 'var(--warn)' : undefined }}>{notReported.length}</div>
            <div className="l">courses without a teacher report (not exported)</div>
          </div>
          <div className="card tight kpi">
            <div className="v" style={{ color: pending ? 'var(--info)' : undefined }}>{pending}</div>
            <div className="l">exported rows not verified yet</div>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="between">
          <h2>1. Check before export</h2>
          {ready ? <span className="badge ok">Ready — the Data Check column will say OK</span> : <span className="badge warn">Fix the items below</span>}
        </div>
        <p className="small muted">
          The workbook&apos;s <b>Data Check</b> column marks a row <i>Incomplete</i> when the course code or batch is empty, and{' '}
          <i>DUPLICATE record</i> when two rows have the same department, year, semester, report type, code and batch.
        </p>

        {missingCode.length > 0 && (
          <div className="stack">
            <h3>Course code missing ({missingCode.length})</h3>
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  {missingCode.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <div className="bold small">{r.name}</div>
                        <div className="tiny muted">
                          {r.classLabel} · Year {r.year_of_study} · {r.teacherNames}
                        </div>
                      </td>
                      <td style={{ width: 260 }}>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <input
                            className="input sm"
                            placeholder="e.g. SEng3041"
                            value={codes[r.course!.id] ?? ''}
                            onChange={(e) => setCodes({ ...codes, [r.course!.id]: e.target.value })}
                          />
                          <button
                            className="btn xs primary"
                            disabled={!(codes[r.course!.id] ?? '').trim()}
                            onClick={async () => {
                              await act({ action: 'setCourseCode', id: r.course!.id, code: codes[r.course!.id] });
                              toast('Code saved');
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {missingBatch.length > 0 && (
          <div className="stack">
            <h3>Batch missing</h3>
            <p className="small muted">Type the batch once for each department and year; it is applied to all its courses that have none.</p>
            {missingBatch.map(([k, g]) => (
              <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="small" style={{ minWidth: 190 }}>
                  <b>{g.department}</b> Year {g.year} · {g.count} course{g.count > 1 ? 's' : ''}
                </span>
                <input className="input sm" style={{ width: 140 }} placeholder="e.g. 2016" value={batches[k] ?? ''} onChange={(e) => setBatches({ ...batches, [k]: e.target.value })} />
                <button
                  className="btn xs primary"
                  disabled={!(batches[k] ?? '').trim()}
                  onClick={async () => {
                    const r = await act<{ updated: number }>({
                      action: 'setBatch',
                      department: g.department,
                      year: g.year,
                      batch: batches[k],
                      academicYear: p.academicYear,
                      semester: p.semester,
                    });
                    toast(`Batch set on ${r.updated} course(s)`);
                  }}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}

        {dupKeys.length > 0 && (
          <div className="stack">
            <h3>Rows that Excel will mark “DUPLICATE record” ({dupKeys.length})</h3>
            <p className="small muted">They share department + code + batch. Usually fixed by giving each course its own code.</p>
            <ul className="small" style={{ margin: 0 }}>
              {dupKeys.map((r) => (
                <li key={r.key}>
                  {r.name} — {r.classLabel} — code “{r.code || '(empty)'}”, batch “{r.batch || '(empty)'}”
                </li>
              ))}
            </ul>
          </div>
        )}

        {ready && <div className="alert ok small">All exported rows have a code and batch, and no two rows share the same key.</div>}

        {notReported.length > 0 && (
          <details className="small">
            <summary className="muted" style={{ cursor: 'pointer' }}>
              {notReported.length} course(s) have no teacher report and will not be in the file
            </summary>
            <ul>
              {notReported.map((r) => (
                <li key={r.key}>
                  {r.name} — {r.classLabel} Year {r.year_of_study} — {r.teacherNames || 'no teacher linked'}
                </li>
              ))}
            </ul>
            <button className="btn xs" onClick={() => goto('report', { view: 'missing' })}>
              Open in Course report
            </button>
          </details>
        )}
      </div>

      <div className="card stack">
        <h2>2. Download</h2>
        <a className="btn primary lg" href={`/api/admin/export?${q}`}>
          ⬇ QA_Course_Coverage_Report.xlsx — exact QA format
        </a>
        <p className="small muted">Use this file for the other system. Nothing is added or renamed; Excel recalculates it when opened.</p>
        <div className="divider" />
        <a className="btn" href={`/api/admin/export?${q}&format=detailed`}>
          ⬇ Detailed workbook (for the QA team)
        </a>
        <p className="small muted">
          Not for import. Extra sheets: every teacher submission (including later ones and duplicates), every student report, how many
          students agree, lab sections, quiz/assignment/exam answers, and a by-teacher summary.
        </p>
      </div>
    </div>
  );
}
