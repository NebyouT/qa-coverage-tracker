'use client';

import { useEffect, useMemo, useState } from 'react';
import { answerSummary, needsAttention, type Row } from '@/lib/consolidate';
import { pct, score } from '@/lib/scoring';
import { fmtDate } from '@/lib/client';
import { parseSections } from '@/lib/normalize';
import type { TeacherReport } from '@/lib/types';
import { Modal, StatusBadge } from '@/components/ui';
import { FlagBadges, ReviewBadge, useAdmin } from '../shared';
import EditReport from './EditReport';

const VIEWS = [
  { id: 'all', label: 'All courses' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'missing', label: 'Not reported' },
  { id: 'pending', label: 'Not verified' },
];

export default function CourseReport() {
  const { data, rows, filter } = useAdmin();
  const s = data.settings;
  const [q, setQ] = useState('');
  const [dept, setDept] = useState(filter.dept ?? '');
  const [year, setYear] = useState('');
  const [teacher, setTeacher] = useState(filter.teacherId ? String(filter.teacherId) : '');
  const [view, setView] = useState(filter.view ?? 'all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setDept(filter.dept ?? '');
    setTeacher(filter.teacherId ? String(filter.teacherId) : '');
    setView(filter.view ?? 'all');
  }, [filter]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (dept && r.department !== dept) return false;
      if (year && String(r.year_of_study) !== year) return false;
      if (teacher && !r.teacherIds.includes(Number(teacher))) return false;
      if (term && !`${r.code} ${r.name} ${r.classLabel} ${r.teacherNames}`.toLowerCase().includes(term)) return false;
      if (view === 'attention' && !needsAttention(r)) return false;
      if (view === 'missing' && r.report) return false;
      if (view === 'pending' && !(r.report && r.report.review === 'pending')) return false;
      return true;
    });
  }, [rows, q, dept, year, teacher, view]);

  const open = rows.find((r) => r.key === openKey) ?? null;
  const exportUrl = `/api/admin/export?ay=${encodeURIComponent(data.period.academicYear)}&sem=${encodeURIComponent(data.period.semester)}&rt=${encodeURIComponent(data.period.reportType)}`;

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search course or teacher" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select sm" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {s.departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code}
            </option>
          ))}
        </select>
        <select className="select sm" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {s.years.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
        <select className="select sm" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">All teachers</option>
          {data.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="select sm" value={view} onChange={(e) => setView(e.target.value)}>
          {VIEWS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="grow" />
        <a className="btn sm primary" href={exportUrl}>
          ⬇ Export Excel
        </a>
      </div>

      <div className="small muted">
        {list.length} of {rows.length} courses. Click a row to see every submission, verify, edit or remove duplicates.
      </div>

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Course</th>
              <th>Class</th>
              <th className="num">Yr</th>
              <th>Teacher</th>
              <th className="num">Chapters</th>
              <th className="num">Lab</th>
              <th>Performance / status</th>
              <th className="num">Students</th>
              <th>Checks</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key} className="click" onClick={() => setOpenKey(r.key)}>
                <td>
                  <div className="bold">{r.name}</div>
                  {r.code && <div className="small muted">{r.code}</div>}
                </td>
                <td>
                  {r.classLabel}
                  {r.classLabel && !r.classLabel.startsWith(r.department) && <div className="tiny faint">by {r.department}</div>}
                </td>
                <td className="num">
                  {r.year_of_study ?? '–'}
                  {r.batch && <div className="tiny faint">{r.batch}</div>}
                </td>
                <td className="small">{r.teacherNames || <span className="faint">–</span>}</td>
                <td className="num">{r.report ? `${r.report.chapters_covered ?? '–'} / ${r.report.total_chapters ?? '–'}` : <span className="faint">–</span>}</td>
                <td className="num">
                  {r.report?.has_lab ? <LabCell r={r.report} /> : <span className="faint">{r.report ? 'No lab' : '–'}</span>}
                </td>
                <td>{r.score ? <StatusBadge status={r.score.status} tone={r.score.tone} rate={r.score.rate} /> : <span className="badge neutral">Not reported</span>}</td>
                <td className="num">
                  {r.students.length ? (
                    <>
                      {r.students.length}
                      <div className="tiny faint">median {r.studentMedianChapters} ch</div>
                    </>
                  ) : (
                    <span className="faint">0</span>
                  )}
                </td>
                <td>
                  <FlagBadges flags={r.flags.filter((f) => f.kind !== 'pending')} max={2} />
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="center muted" style={{ padding: 30 }}>
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CourseDetail row={open} onClose={() => setOpenKey(null)} />
    </div>
  );
}

/** "6 / 16", or per lab section "avg 7 / 16 (8 · 6)" */
export function LabCell({ r }: { r: TeacherReport }) {
  const per = parseSections(r.labs_by_section);
  const avg = r.labs_covered === null ? '–' : Number.isInteger(r.labs_covered) ? r.labs_covered : r.labs_covered.toFixed(1);
  return (
    <>
      {avg} / {r.total_lab_sessions ?? '–'}
      {per.length > 1 && <div className="tiny faint">sections {per.join(' · ')}</div>}
      {r.tutorials_done !== null && <div className="tiny faint">tut {r.tutorials_done}</div>}
    </>
  );
}

function CourseDetail({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { data, act, toast } = useAdmin();
  const [editing, setEditing] = useState<TeacherReport | null>(null);
  if (!row) return null;
  const allTeacher = data.teacherReports
    .filter((r) => row.submissions.some((x) => x.id === r.id) || (row.course && r.course_id === row.course.id))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const review = async (kind: 'teacher' | 'student', ids: number[], v: string) => {
    await act({ action: 'setReview', kind, ids, review: v });
    toast(v === 'verified' ? 'Verified' : v === 'rejected' ? 'Rejected' : 'Updated');
  };
  const remove = async (kind: 'teacher' | 'student', ids: number[]) => {
    if (!window.confirm('Delete permanently? This cannot be undone.')) return;
    await act({ action: 'deleteReports', kind, ids });
    toast('Deleted');
  };

  return (
    <Modal open={!!row} onClose={onClose} title={[row.name, row.code].filter(Boolean).join(' · ')} wide>
      <div className="stack-lg">
        <div className="row small muted">
          <span>{row.classLabel || row.department}</span>·<span>Year {row.year_of_study ?? '–'}</span>
          {row.course?.students && (
            <>
              ·<span>{row.course.students} students</span>
            </>
          )}
          {row.course && (row.course.lec_hours !== null || row.course.lab_hours !== null) && (
            <>
              ·
              <span>
                Lec {row.course.lec_hours ?? 0}h / Lab {row.course.lab_hours ?? 0}h{(row.course.lab_sections ?? 0) > 1 ? ` ×${row.course.lab_sections}` : ''} / Tut{' '}
                {row.course.tut_hours ?? 0}h per week
              </span>
            </>
          )}
          {row.batch && (
            <>
              ·<span>Batch {row.batch}</span>
            </>
          )}
          {row.crhr && (
            <>
              ·<span>{row.crhr} CrHr</span>
            </>
          )}
          ·<span>{row.teacherNames || 'No teacher linked'}</span>
        </div>

        <div className="grid-3">
          <div className="card tight">
            <div className="label">Used in report</div>
            {row.score ? <StatusBadge status={row.score.status} tone={row.score.tone} rate={row.score.rate} /> : <span className="faint">No teacher report</span>}
            {row.score && (
              <div className="small muted" style={{ marginTop: 6 }}>
                Lecture {pct(row.score.lecture)} · Lab {pct(row.score.lab)}
              </div>
            )}
          </div>
          <div className="card tight">
            <div className="label">Students</div>
            <div className="bold">{row.students.length} report{row.students.length === 1 ? '' : 's'}</div>
            <div className="small muted">
              Median chapters: {row.studentMedianChapters ?? '–'}
              {row.studentMedianLabs !== null && ` · labs ${row.studentMedianLabs}`}
            </div>
          </div>
          <div className="card tight">
            <div className="label">Checks</div>
            <FlagBadges flags={row.flags} max={6} />
          </div>
        </div>

        {row.checks.length > 0 && (
          <div className="stack">
            <h3>Quiz, assignment, exam and lab</h3>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Teacher</th>
                    <th className="num">Students yes</th>
                    <th className="num">Students no</th>
                  </tr>
                </thead>
                <tbody>
                  {row.checks.map((ck) => (
                    <tr key={ck.key}>
                      <td className="small">{ck.label}</td>
                      <td>
                        {ck.teacher ? (
                          <span className={`badge ${ck.teacher === 'yes' ? 'ok' : 'neutral'}`}>{ck.teacher === 'yes' ? 'Yes' : 'No'}</span>
                        ) : (
                          <span className="faint">–</span>
                        )}
                      </td>
                      <td className="num">{ck.studentsYes || <span className="faint">0</span>}</td>
                      <td className="num">{ck.studentsNo || <span className="faint">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="stack">
          <h3>Teacher submissions ({allTeacher.length})</h3>
          {allTeacher.length > 1 && (
            <p className="small muted">The report uses the newest verified submission (or the newest one if none is verified). Reject or delete the duplicates you don&apos;t want.</p>
          )}
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Teacher</th>
                  <th className="num">Chapters</th>
                  <th className="num">Lab</th>
                  <th>Result</th>
                  <th>Notes</th>
                  <th>Review</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allTeacher.map((r) => {
                  const sc = score(r, data.settings);
                  const used = row.report?.id === r.id;
                  return (
                    <tr key={r.id} className={r.review === 'rejected' ? 'dim' : ''}>
                      <td className="small">
                        {fmtDate(r.created_at)}
                        {used && <div><span className="badge info">Used</span></div>}
                      </td>
                      <td className="small">{r.teacher_name}</td>
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
                        <ReviewBadge review={r.review} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          {r.review !== 'verified' && (
                            <button className="btn xs" onClick={() => review('teacher', [r.id], 'verified')}>
                              ✓ Verify
                            </button>
                          )}
                          {r.review !== 'rejected' && (
                            <button className="btn xs" onClick={() => review('teacher', [r.id], 'rejected')}>
                              Reject
                            </button>
                          )}
                          <button className="btn xs" onClick={() => setEditing(r)}>
                            Edit
                          </button>
                          <button className="btn xs danger" onClick={() => remove('teacher', [r.id])}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!allTeacher.length && (
                  <tr>
                    <td colSpan={8} className="muted center">
                      The teacher has not reported this course yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <h3>Student reports ({row.students.length})</h3>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Student</th>
                  <th className="num">Chapters</th>
                  <th className="num">Labs</th>
                  <th>Answers</th>
                  <th>Comment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row.students.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{fmtDate(r.created_at)}</td>
                    <td className="small">{r.student_name}</td>
                    <td className="num">{r.chapters_covered}</td>
                    <td className="num">{r.labs_covered ?? '–'}</td>
                    <td className="small">{answerSummary(r.answers, data.settings.questions) || <span className="faint">–</span>}</td>
                    <td className="small">{r.comment || <span className="faint">–</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <button className="btn xs" onClick={() => review('student', [r.id], 'rejected')}>
                          Reject
                        </button>
                        <button className="btn xs danger" onClick={() => remove('student', [r.id])}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!row.students.length && (
                  <tr>
                    <td colSpan={7} className="muted center">
                      No student reports yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <EditReport report={editing} onClose={() => setEditing(null)} />
    </Modal>
  );
}
