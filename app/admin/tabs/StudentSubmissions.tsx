'use client';

import { useMemo, useState } from 'react';
import { fmtDate } from '@/lib/client';
import { nameKey } from '@/lib/normalize';
import type { StudentReport } from '@/lib/types';
import { ReviewBadge, useAdmin } from '../shared';

type Group = {
  submission: string;
  rows: StudentReport[];
  name: string;
  department: string;
  year: number | null;
  semester: string;
  created_at: string;
  comment: string;
  review: string;
  flags: string[];
};

export default function StudentSubmissions() {
  const { data, act, toast } = useAdmin();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [onlyFlags, setOnlyFlags] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of data.studentReports) {
      const k = r.submission || `id${r.id}`;
      let g = m.get(k);
      if (!g) {
        g = {
          submission: k,
          rows: [],
          name: r.student_name,
          department: r.department,
          year: r.year_of_study,
          semester: r.semester,
          created_at: r.created_at,
          comment: r.comment,
          review: r.review,
          flags: [],
        };
        m.set(k, g);
      }
      g.rows.push(r);
      if (r.review === 'pending') g.review = 'pending';
    }
    const list = [...m.values()];
    // Same student name submitting more than once, and one phone used for several names.
    const byName = new Map<string, number>();
    const namesByDevice = new Map<string, Set<string>>();
    for (const g of list) {
      byName.set(nameKey(g.name), (byName.get(nameKey(g.name)) ?? 0) + 1);
      const dev = g.rows[0].device;
      if (dev) {
        if (!namesByDevice.has(dev)) namesByDevice.set(dev, new Set());
        namesByDevice.get(dev)!.add(nameKey(g.name));
      }
    }
    for (const g of list) {
      const n = byName.get(nameKey(g.name)) ?? 0;
      if (n > 1) g.flags.push(`Same name sent ${n}×`);
      const dev = g.rows[0].device;
      const names = dev ? namesByDevice.get(dev)?.size ?? 0 : 0;
      if (names > 1) g.flags.push(`Phone used for ${names} names`);
      if (!g.rows.some((r) => r.course_id)) g.flags.push('Courses typed by hand');
    }
    return list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [data.studentReports]);

  const list = groups.filter((g) => {
    const term = q.trim().toLowerCase();
    if (dept && g.department !== dept) return false;
    if (onlyFlags && !g.flags.length) return false;
    if (term && !`${g.name} ${g.rows.map((r) => r.course_code + ' ' + r.course_name).join(' ')}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const setReview = async (g: Group, review: string) => {
    await act({ action: 'setReview', kind: 'student', ids: g.rows.map((r) => r.id), review });
    toast(review === 'rejected' ? 'Rejected — not counted any more' : 'Updated');
  };

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search student or course" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select sm" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {data.settings.departments.map((d) => (
            <option key={d.code}>{d.code}</option>
          ))}
        </select>
        <label className="row small">
          <input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} /> Only flagged
        </label>
      </div>
      <div className="small muted">
        {list.length} submissions. Rejected ones are not counted in the students&apos; median shown on the course report.
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>When</th>
              <th>Student</th>
              <th>Class</th>
              <th>Chapters covered (per course)</th>
              <th>Comment</th>
              <th>Checks</th>
              <th>Review</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.submission} className={g.review === 'rejected' ? 'dim' : ''}>
                <td className="small">{fmtDate(g.created_at)}</td>
                <td className="small bold">{g.name}</td>
                <td className="small">
                  {g.department} · Y{g.year}
                </td>
                <td className="small">
                  {g.rows.map((r) => (
                    <div key={r.id}>
                      <span className={r.course_id ? 'bold' : ''}>{r.course_code || r.course_name}</span>: {r.chapters_covered} ch
                      {r.labs_covered !== null && `, ${r.labs_covered} labs`}
                    </div>
                  ))}
                </td>
                <td className="small" style={{ maxWidth: 220 }}>
                  {g.comment || <span className="faint">–</span>}
                </td>
                <td>
                  {g.flags.length ? (
                    g.flags.map((f) => (
                      <span key={f} className="badge warn" style={{ marginRight: 4, marginBottom: 2 }}>
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="badge ok">OK</span>
                  )}
                </td>
                <td>
                  <ReviewBadge review={g.review} />
                </td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    {g.review !== 'verified' && (
                      <button className="btn xs" onClick={() => setReview(g, 'verified')}>
                        ✓
                      </button>
                    )}
                    {g.review !== 'rejected' && (
                      <button className="btn xs" title="Reject" onClick={() => setReview(g, 'rejected')}>
                        ✕
                      </button>
                    )}
                    <button
                      className="btn xs danger"
                      onClick={async () => {
                        if (!window.confirm('Delete this submission permanently?')) return;
                        await act({ action: 'deleteReports', kind: 'student', ids: g.rows.map((r) => r.id) });
                        toast('Deleted');
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={8} className="center muted" style={{ padding: 30 }}>
                  No student submissions for this period yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
