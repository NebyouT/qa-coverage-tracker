'use client';

import { useEffect, useState } from 'react';
import { byDeptYear, needsAttention, summarize } from '@/lib/consolidate';
import { isFinal, pct } from '@/lib/scoring';
import { periodLabel } from '@/lib/client';
import type { Period } from '@/lib/types';
import { useAdmin } from '../shared';

export default function Overview() {
  const { data, rows, act, goto, toast } = useAdmin();
  const s = data.settings;
  const [origin, setOrigin] = useState('');
  const [p, setP] = useState<Period>(s.period);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setP(s.period), [s.period]);

  const withCourse = rows.filter((r) => r.course);
  const reported = rows.filter((r) => r.report).length;
  const submissions = new Set(data.studentReports.map((r) => r.submission)).size;
  const attention = rows.filter(needsAttention).length;
  const final = isFinal(data.period.reportType);
  const bands = final ? s.finalBands : s.midBands;
  const summary = summarize(rows, s, final);
  const dy = byDeptYear(rows, s);
  const changed = JSON.stringify(p) !== JSON.stringify(s.period);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied');
    } catch {
      window.prompt('Copy this link', text);
    }
  };

  return (
    <div className="stack-lg">
      <div className="grid-2">
        <div className="card stack">
          <h2>Reporting period</h2>
          <p className="small muted">Teachers and students report for this period. Change it when a new report round starts.</p>
          <div className="grid-3">
            <label className="field">
              <span className="label">Academic year</span>
              <input className="input sm" value={p.academicYear} onChange={(e) => setP({ ...p, academicYear: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Semester</span>
              <select className="select sm" value={p.semester} onChange={(e) => setP({ ...p, semester: e.target.value })}>
                {s.semesters.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Report type</span>
              <select className="select sm" value={p.reportType} onChange={(e) => setP({ ...p, reportType: e.target.value })}>
                {s.reportTypes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <button
              className="btn primary sm"
              disabled={!changed}
              onClick={async () => {
                await act({ action: 'setPeriod', period: p });
                toast('Active period saved');
              }}
            >
              Save period
            </button>
            <label className="row small">
              <input
                type="checkbox"
                checked={s.teachersOpen}
                onChange={(e) => act({ action: 'saveSettings', settings: { ...s, teachersOpen: e.target.checked } })}
              />
              Teachers can report
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={s.studentsOpen}
                onChange={(e) => act({ action: 'saveSettings', settings: { ...s, studentsOpen: e.target.checked } })}
              />
              Students can report
            </label>
          </div>
        </div>

        <div className="card stack">
          <h2>Links to share</h2>
          <p className="small muted">Send these on Telegram. No login needed.</p>
          {[
            ['Teachers', `${origin}/teacher`],
            ['Students', `${origin}/student`],
          ].map(([label, url]) => (
            <div key={label} className="between" style={{ flexWrap: 'nowrap' }}>
              <div className="grow" style={{ overflow: 'hidden' }}>
                <div className="label">{label}</div>
                <div className="small mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {url}
                </div>
              </div>
              <button className="btn sm" onClick={() => copy(url)}>
                Copy
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="kpis">
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => goto('courses')}>
          <div className="v">{withCourse.length}</div>
          <div className="l">Courses this semester</div>
        </button>
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => goto('report', { view: 'missing' })}>
          <div className="v">
            {reported}
            <span className="muted" style={{ fontSize: '1rem' }}> / {rows.length}</span>
          </div>
          <div className="l">Courses reported by teachers</div>
        </button>
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => goto('ssubs')}>
          <div className="v">{submissions}</div>
          <div className="l">Student submissions</div>
        </button>
        <button className="card kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => goto('report', { view: 'attention' })}>
          <div className="v" style={{ color: attention ? 'var(--err)' : undefined }}>{attention}</div>
          <div className="l">Need attention (duplicates, teacher/student differences, missing data)</div>
        </button>
      </div>

      <div className="stack">
        <div className="between">
          <h2>Summary by department — {periodLabel(data.period)}</h2>
          <a
            className="btn sm"
            href={`/api/admin/export?ay=${encodeURIComponent(data.period.academicYear)}&sem=${encodeURIComponent(data.period.semester)}&rt=${encodeURIComponent(data.period.reportType)}`}
          >
            ⬇ Export Excel
          </a>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">Reported</th>
                <th className="num">Avg lecture</th>
                <th className="num">Avg lab</th>
                <th className="num">Avg performance</th>
                {bands.map((b) => (
                  <th key={b.name} className="num" title={b.name}>
                    {b.name.split('–')[0].trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((d) => (
                <tr key={d.department} className={d.department === 'All' ? '' : 'click'} onClick={() => d.department !== 'All' && goto('report', { dept: d.department })}>
                  <td className="bold">{d.department === 'All' ? 'All departments' : d.department}</td>
                  <td className="num">
                    {d.reported} / {d.total}
                  </td>
                  <td className="num">{pct(d.avgLecture, 1)}</td>
                  <td className="num">{pct(d.avgLab, 1)}</td>
                  <td className="num bold">{pct(d.avgRate, 1)}</td>
                  {bands.map((b) => (
                    <td key={b.name} className="num">
                      {d.statusCounts[b.name] || <span className="faint">0</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stack">
        <h2>Average performance by department and year of study</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Department</th>
                {s.years.map((y) => (
                  <th key={y} className="num">
                    Year {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dy.map((r) => (
                <tr key={r.department}>
                  <td className="bold">{r.department === 'All' ? 'All departments' : r.department}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="num">
                      {v === null ? <span className="faint">–</span> : pct(v, 1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
