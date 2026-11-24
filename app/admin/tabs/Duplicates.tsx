'use client';

import { useMemo } from 'react';
import { answerSummary, findDuplicates, type DupGroup } from '@/lib/consolidate';
import { fmtDate } from '@/lib/client';
import { score } from '@/lib/scoring';
import { StatusBadge } from '@/components/ui';
import { ReviewBadge, useAdmin } from '../shared';
import { LabCell } from './CourseReport';

/** Everything that was entered more than once, so the admin decides which entry counts. Nothing is replaced automatically. */
export default function Duplicates() {
  const { data, rows, act, toast } = useAdmin();
  const d = useMemo(
    () =>
      findDuplicates({
        period: data.period,
        courses: data.courses,
        teachers: data.teachers,
        teacherReports: data.teacherReports,
        studentReports: data.studentReports,
      }),
    [data],
  );
  const usedId = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) if (r.course && r.report) m.set(r.course.id, r.report.id);
    return m;
  }, [rows]);

  const confirmDelete = async (kind: 'teacher' | 'student', id: number) => {
    if (!window.confirm('Delete this entry permanently? This cannot be undone.')) return;
    await act({ action: 'deleteReports', kind, ids: [id] });
    toast('Deleted');
  };

  const total = d.teacherReports.length + d.studentReports.length + d.courses.length + d.teachers.length;

  return (
    <div className="stack-lg">
      <div className="card stack">
        <h2>Duplicate entries</h2>
        <p className="small muted">
          Entries with the same name added more than once. Nothing is replaced automatically: for teacher reports the course report keeps the{' '}
          <b>first</b> one sent until you choose another with <b>Use this one</b>. Reject or delete the entries you don&apos;t want.
        </p>
        {total === 0 && <div className="alert ok small">No duplicates in this period.</div>}
      </div>

      {d.teacherReports.length > 0 && (
        <Section title="Same course reported more than once" groups={d.teacherReports}>
          {(g) => (
            <table className="t">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sent</th>
                  <th>Teacher</th>
                  <th className="num">Chapters</th>
                  <th className="num">Lab</th>
                  <th>Result</th>
                  <th>Answers / notes</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.entries.map((r, i) => {
                  const sc = score(r, data.settings);
                  const used = r.course_id ? usedId.get(r.course_id) === r.id : false;
                  return (
                    <tr key={r.id} className={r.review === 'rejected' ? 'dim' : ''}>
                      <td className="small">{g.entries.length - i}</td>
                      <td className="small">{fmtDate(r.created_at)}</td>
                      <td className="small bold">{r.teacher_name}</td>
                      <td className="num">
                        {r.chapters_covered} / {r.total_chapters}
                      </td>
                      <td className="num">{r.has_lab ? <LabCell r={r} /> : 'No'}</td>
                      <td>
                        <StatusBadge status={sc.status} tone={sc.tone} rate={sc.rate} />
                      </td>
                      <td className="small" style={{ maxWidth: 220 }}>
                        {[answerSummary(r.answers, data.settings.questions), r.tags, r.remarks].filter(Boolean).join('. ') || <span className="faint">–</span>}
                      </td>
                      <td>
                        {used ? <span className="badge info">Used in report</span> : <ReviewBadge review={r.review} />}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          {!used && (
                            <button
                              className="btn xs primary"
                              onClick={async () => {
                                await act({ action: 'useReport', id: r.id });
                                toast('This report is now used');
                              }}
                            >
                              Use this one
                            </button>
                          )}
                          {r.review !== 'rejected' && !used && (
                            <button
                              className="btn xs"
                              onClick={async () => {
                                await act({ action: 'setReview', kind: 'teacher', ids: [r.id], review: 'rejected' });
                                toast('Rejected');
                              }}
                            >
                              Reject
                            </button>
                          )}
                          <button className="btn xs danger" onClick={() => confirmDelete('teacher', r.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {d.studentReports.length > 0 && (
        <Section title="Same student reported the same course more than once" groups={d.studentReports}>
          {(g) => (
            <table className="t">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th className="num">Chapters</th>
                  <th className="num">Labs</th>
                  <th>Answers</th>
                  <th>Comment</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.entries.map((r) => (
                  <tr key={r.id} className={r.review === 'rejected' ? 'dim' : ''}>
                    <td className="small">{fmtDate(r.created_at)}</td>
                    <td className="num">{r.chapters_covered}</td>
                    <td className="num">
                      {r.labs_covered ?? '–'}
                      {r.lab_section && <div className="tiny faint">sec {r.lab_section}</div>}
                    </td>
                    <td className="small">{answerSummary(r.answers, data.settings.questions) || <span className="faint">–</span>}</td>
                    <td className="small">{r.comment || <span className="faint">–</span>}</td>
                    <td>
                      <ReviewBadge review={r.review} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        {r.review !== 'rejected' && (
                          <button
                            className="btn xs"
                            onClick={async () => {
                              await act({ action: 'setReview', kind: 'student', ids: [r.id], review: 'rejected' });
                              toast('Rejected — not counted');
                            }}
                          >
                            Reject
                          </button>
                        )}
                        <button className="btn xs danger" onClick={() => confirmDelete('student', r.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {d.courses.length > 0 && (
        <Section title="Same course listed more than once" groups={d.courses}>
          {(g) => (
            <table className="t">
              <tbody>
                {g.entries.map((c) => (
                  <tr key={c.id}>
                    <td className="small bold">{c.name}</td>
                    <td className="small">{c.code || <span className="faint">no code</span>}</td>
                    <td className="small">{c.source}</td>
                    <td className="small">{c.teacher_ids.length} teacher(s)</td>
                    <td>
                      <button
                        className="btn xs danger"
                        onClick={async () => {
                          if (!window.confirm(`Delete this copy of ${c.name}? Reports already sent are kept.`)) return;
                          await act({ action: 'deleteCourse', id: c.id });
                          toast('Course deleted');
                        }}
                      >
                        Delete this copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {d.teachers.length > 0 && (
        <Section title="Same or similar teacher names" groups={d.teachers}>
          {(g) => (
            <table className="t">
              <tbody>
                {g.entries.map((t) => (
                  <tr key={t.id} className={t.active ? '' : 'dim'}>
                    <td className="small bold">{t.name}</td>
                    <td className="small">{t.department}</td>
                    <td className="small">{t.source === 'teacher' ? 'added by teacher' : t.source}</td>
                    <td className="small">{data.teacherReports.filter((r) => r.teacher_id === t.id).length} report(s) this period</td>
                    <td>
                      {t.active && (
                        <button
                          className="btn xs"
                          onClick={async () => {
                            await act({ action: 'updateTeacher', ...t, active: false });
                            toast('Hidden from the teacher list');
                          }}
                        >
                          Hide name
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
    </div>
  );
}

function Section<T>({ title, groups, children }: { title: string; groups: DupGroup<T>[]; children: (g: DupGroup<T>) => React.ReactNode }) {
  return (
    <div className="stack">
      <h2>
        {title} <span className="badge warn">{groups.length}</span>
      </h2>
      {groups.map((g) => (
        <div key={g.key} className="card stack" style={{ padding: 12 }}>
          <div className="between">
            <div>
              <div className="bold">{g.title}</div>
              <div className="small muted">{g.subtitle}</div>
            </div>
            <span className="badge neutral">
              {g.entries.length} entries{g.open !== g.entries.length ? ` · ${g.open} open` : ''}
            </span>
          </div>
          <div className="table-wrap">{children(g)}</div>
        </div>
      ))}
    </div>
  );
}
