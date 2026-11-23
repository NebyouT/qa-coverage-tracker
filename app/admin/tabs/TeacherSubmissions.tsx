'use client';

import { useMemo, useState } from 'react';
import { score } from '@/lib/scoring';
import { fmtDate } from '@/lib/client';
import type { TeacherReport } from '@/lib/types';
import { StatusBadge } from '@/components/ui';
import { ReviewBadge, useAdmin } from '../shared';
import EditReport from './EditReport';
import { LabCell } from './CourseReport';

export default function TeacherSubmissions() {
  const { data, rows, act, toast } = useAdmin();
  const [q, setQ] = useState('');
  const [rev, setRev] = useState('');
  const [editing, setEditing] = useState<TeacherReport | null>(null);

  // Flags per submission, taken from the consolidated rows.
  const flagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const r of rows) {
      for (const sub of r.submissions) {
        const f: string[] = [];
        if (r.submissions.length > 1) f.push(`Duplicate (${r.submissions.length})`);
        if (r.report?.id === sub.id) r.flags.filter((x) => x.kind === 'gap').forEach((x) => f.push(x.label));
        m.set(sub.id, f);
      }
    }
    return m;
  }, [rows]);

  const list = data.teacherReports.filter((r) => {
    const term = q.trim().toLowerCase();
    if (rev && r.review !== rev) return false;
    if (term && !`${r.teacher_name} ${r.course_code} ${r.course_name}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const cleanPending = data.teacherReports.filter((r) => r.review === 'pending' && !(flagsById.get(r.id) ?? []).length);

  const review = async (ids: number[], v: string) => {
    await act({ action: 'setReview', kind: 'teacher', ids, review: v });
    toast(`${ids.length} updated`);
  };

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search teacher or course" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select sm" value={rev} onChange={(e) => setRev(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="grow" />
        <button className="btn sm" disabled={!cleanPending.length} onClick={() => review(cleanPending.map((r) => r.id), 'verified')}>
          ✓ Verify {cleanPending.length} pending without problems
        </button>
      </div>
      <div className="small muted">Every submission is kept, including repeats. Verify the right one; reject or delete the rest.</div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>When</th>
              <th>Teacher</th>
              <th>Course</th>
              <th className="num">Chapters</th>
              <th className="num">Lab</th>
              <th>Result</th>
              <th>Notes</th>
              <th>Checks</th>
              <th>Review</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const sc = score(r, data.settings);
              const f = flagsById.get(r.id) ?? [];
              return (
                <tr key={r.id} className={r.review === 'rejected' ? 'dim' : ''}>
                  <td className="small">{fmtDate(r.created_at)}</td>
                  <td className="small bold">{r.teacher_name}</td>
                  <td>
                    <div className="bold small">{r.course_name}</div>
                    <div className="tiny muted">
                      {[r.course_code, [r.student_dept || r.department, r.section].filter(Boolean).join(' '), `Y${r.year_of_study}`].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="num">
                    {r.chapters_covered} / {r.total_chapters}
                  </td>
                  <td className="num">{r.has_lab ? <LabCell r={r} /> : 'No'}</td>
                  <td>
                    <StatusBadge status={sc.status} tone={sc.tone} rate={sc.rate} />
                  </td>
                  <td className="small" style={{ maxWidth: 200 }}>
                    {[r.tags, r.remarks].filter(Boolean).join('. ') || <span className="faint">–</span>}
                  </td>
                  <td>
                    {f.length ? (
                      f.map((x) => (
                        <span key={x} className={`badge ${x.startsWith('Dup') ? 'warn' : 'error'}`} style={{ marginRight: 4 }}>
                          {x}
                        </span>
                      ))
                    ) : (
                      <span className="badge ok">OK</span>
                    )}
                  </td>
                  <td>
                    <ReviewBadge review={r.review} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      {r.review !== 'verified' && (
                        <button className="btn xs" onClick={() => review([r.id], 'verified')}>
                          ✓
                        </button>
                      )}
                      {r.review !== 'rejected' && (
                        <button className="btn xs" title="Reject" onClick={() => review([r.id], 'rejected')}>
                          ✕
                        </button>
                      )}
                      <button className="btn xs" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                      <button
                        className="btn xs danger"
                        onClick={async () => {
                          if (!window.confirm('Delete this submission permanently?')) return;
                          await act({ action: 'deleteReports', kind: 'teacher', ids: [r.id] });
                          toast('Deleted');
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={10} className="center muted" style={{ padding: 30 }}>
                  No teacher submissions for this period yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <EditReport report={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
