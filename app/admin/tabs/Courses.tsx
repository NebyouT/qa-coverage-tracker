'use client';

import { useMemo, useState } from 'react';
import type { Course } from '@/lib/types';
import { classLabel, normYesNo } from '@/lib/normalize';
import { Modal, Seg } from '@/components/ui';
import { useAdmin } from '../shared';

type Edit = Omit<Course, 'id'> & { id?: number };

export default function Courses() {
  const { data, act, toast, reload } = useAdmin();
  const s = data.settings;
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [editing, setEditing] = useState<Edit | null>(null);
  const [bulk, setBulk] = useState(false);
  const [importing, setImporting] = useState(false);
  const teacherName = useMemo(() => new Map(data.teachers.map((t) => [t.id, t.name])), [data.teachers]);

  const list = data.courses.filter((c) => {
    const term = q.trim().toLowerCase();
    if (dept && c.department !== dept) return false;
    if (term && !`${c.code} ${c.name} ${classLabel(c)} ${c.teacher_ids.map((id) => teacherName.get(id)).join(' ')}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const blank = (): Edit => ({
    academic_year: data.period.academicYear,
    semester: data.period.semester,
    department: dept || s.departments[0]?.code || '',
    student_dept: '',
    section: '',
    year_of_study: s.years[0] ?? 1,
    batch: '',
    code: '',
    name: '',
    crhr: null,
    total_chapters: null,
    has_lab: false,
    total_lab_sessions: null,
    students: null,
    lec_hours: null,
    lab_hours: null,
    tut_hours: null,
    lec_sections: null,
    lab_sections: null,
    tut_sections: null,
    curriculum_semester: '',
    source: 'admin',
    teacher_ids: [],
  });

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search course, class or teacher" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select sm" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {s.departments.map((d) => (
            <option key={d.code}>{d.code}</option>
          ))}
        </select>
        <span className="grow" />
        <button
          className="btn sm"
          title="Adds the built-in 2019 E.C. Semester I list (SE offering + IT) if any course or lecturer is missing"
          onClick={async () => {
            const r = await act<{ courses: number; teachers: number }>({ action: 'seedCourses' });
            toast(r.courses || r.teachers ? `Added ${r.courses} course(s) and ${r.teachers} lecturer(s)` : 'Built-in list is already loaded');
          }}
        >
          Load built-in list
        </button>
        <button className="btn sm" onClick={() => setImporting(true)}>
          Import Excel
        </button>
        <button className="btn sm" onClick={() => setBulk(true)}>
          Paste list
        </button>
        <button className="btn sm primary" onClick={() => setEditing(blank())}>
          ＋ Add course
        </button>
      </div>
      <div className="small muted">
        Course list for {data.period.academicYear}, {data.period.semester} ({data.courses.length}). Students see these by their class and
        year; teachers see the ones linked to them.
        Courses added by teachers are marked <span className="badge info">New</span> until you approve them.
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Course</th>
              <th>Class</th>
              <th className="num">Year</th>
              <th className="num">CrHr</th>
              <th className="num" title="Weekly hours: lecture / lab / tutorial">Hrs L/Lb/T</th>
              <th className="num">Lab sections</th>
              <th className="num">Students</th>
              <th className="num">Chapters</th>
              <th className="num">Lab sessions</th>
              <th>Teachers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="click" onClick={() => setEditing({ ...c })}>
                <td>
                  <span className="bold">{c.name}</span> {c.source === 'teacher' && <span className="badge info">New</span>}
                  {c.code && <div className="tiny muted">{c.code}</div>}
                </td>
                <td>
                  {classLabel(c)}
                  {c.student_dept && <div className="tiny faint">by {c.department}</div>}
                </td>
                <td className="num">
                  {c.year_of_study}
                  {c.batch && <div className="tiny faint">{c.batch}</div>}
                </td>
                <td className="num">{c.crhr ?? <span className="faint">–</span>}</td>
                <td className="num">
                  {c.lec_hours === null && c.lab_hours === null ? <span className="faint">–</span> : `${c.lec_hours ?? 0}/${c.lab_hours ?? 0}/${c.tut_hours ?? 0}`}
                </td>
                <td className="num">{c.has_lab ? c.lab_sections ?? 1 : <span className="faint">–</span>}</td>
                <td className="num">{c.students ?? <span className="faint">–</span>}</td>
                <td className="num">{c.total_chapters ?? <span className="faint">–</span>}</td>
                <td className="num">{c.has_lab ? c.total_lab_sessions ?? '?' : <span className="faint">No lab</span>}</td>
                <td className="small">{c.teacher_ids.map((id) => teacherName.get(id)).filter(Boolean).join(', ') || <span className="faint">–</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {c.source === 'teacher' && (
                    <button
                      className="btn xs"
                      onClick={async () => {
                        await act({ action: 'saveCourse', course: { ...c, source: 'admin' } });
                        toast('Course approved');
                      }}
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={11} className="center muted" style={{ padding: 30 }}>
                  No courses yet. Import the department&apos;s course offering Excel, paste a list, or add them one by one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CourseEditor course={editing} onClose={() => setEditing(null)} />
      <BulkAdd open={bulk} onClose={() => setBulk(false)} />
      <ImportExcel open={importing} onClose={() => setImporting(false)} onDone={reload} />
    </div>
  );
}

function CourseEditor({ course, onClose }: { course: Edit | null; onClose: () => void }) {
  const { data, act, toast } = useAdmin();
  const s = data.settings;
  const [c, setC] = useState<Edit | null>(course);
  const [err, setErr] = useState('');
  const [prev, setPrev] = useState<Edit | null>(null);
  if (course !== prev) {
    setPrev(course);
    setC(course);
    setErr('');
  }
  if (!c) return null;
  const n = (v: string) => (v === '' ? null : Number(v.replace(/[^\d.]/g, '')));
  return (
    <Modal open={!!course} onClose={onClose} title={c.id ? `Edit ${c.name}` : 'Add course'}>
      <div className="stack">
        <label className="field">
          <span className="label">Course name</span>
          <input className="input sm" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus={!c.id} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span className="label">Code (optional)</span>
            <input className="input sm" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Offered by (QA team)</span>
            <select className="select sm" value={c.department} onChange={(e) => setC({ ...c, department: e.target.value })}>
              {s.departments.map((d) => (
                <option key={d.code}>{d.code}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Students&apos; dept (if other)</span>
            <input className="input sm" value={c.student_dept} placeholder={c.department} onChange={(e) => setC({ ...c, student_dept: e.target.value.toUpperCase() })} />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span className="label">Section</span>
            <input className="input sm" value={c.section} placeholder="e.g. Sec 1" onChange={(e) => setC({ ...c, section: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Students</span>
            <input className="input sm" value={c.students ?? ''} onChange={(e) => setC({ ...c, students: n(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Curriculum sem.</span>
            <input className="input sm" value={c.curriculum_semester} placeholder="I / II" onChange={(e) => setC({ ...c, curriculum_semester: e.target.value })} />
          </label>
        </div>
        <div className="grid-3">
          {(['lec', 'lab', 'tut'] as const).map((k) => (
            <div key={k} className="field">
              <span className="label">{k === 'lec' ? 'Lecture' : k === 'lab' ? 'Lab' : 'Tutorial'} hrs/wk · sections</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input sm"
                  value={c[`${k}_hours`] ?? ''}
                  onChange={(e) => {
                    const v = n(e.target.value);
                    setC({ ...c, [`${k}_hours`]: v, ...(k === 'lab' ? { has_lab: (v ?? 0) > 0 } : {}) });
                  }}
                  aria-label={`${k} hours`}
                />
                <input className="input sm" value={c[`${k}_sections`] ?? ''} onChange={(e) => setC({ ...c, [`${k}_sections`]: n(e.target.value) })} aria-label={`${k} sections`} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid-3">
          <label className="field">
            <span className="label">Year of study</span>
            <select className="select sm" value={c.year_of_study} onChange={(e) => setC({ ...c, year_of_study: Number(e.target.value) })}>
              {s.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Batch</span>
            <input className="input sm" value={c.batch} onChange={(e) => setC({ ...c, batch: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Credit hours</span>
            <input className="input sm" value={c.crhr ?? ''} onChange={(e) => setC({ ...c, crhr: n(e.target.value) })} />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span className="label">Total chapters</span>
            <input className="input sm" value={c.total_chapters ?? ''} onChange={(e) => setC({ ...c, total_chapters: n(e.target.value) })} />
          </label>
          <div className="field">
            <span className="label">Lab</span>
            <Seg
              options={[
                { value: false, label: 'No' },
                { value: true, label: 'Yes' },
              ]}
              value={c.has_lab}
              onChange={(v) => setC({ ...c, has_lab: v })}
            />
          </div>
          {c.has_lab && (
            <label className="field">
              <span className="label">Lab sessions (per section)</span>
              <input className="input sm" value={c.total_lab_sessions ?? ''} onChange={(e) => setC({ ...c, total_lab_sessions: n(e.target.value) })} />
            </label>
          )}
        </div>
        <div className="field">
          <span className="label">Teachers (tap to assign)</span>
          <div className="chips" style={{ maxHeight: 160, overflow: 'auto' }}>
            {data.teachers
              .filter((t) => t.active)
              .sort((a, b) => Number(b.department === c.department) - Number(a.department === c.department) || a.name.localeCompare(b.name))
              .map((t) => {
                const on = c.teacher_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`chip soft${on ? ' on' : ''}`}
                    onClick={() => setC({ ...c, teacher_ids: on ? c.teacher_ids.filter((x) => x !== t.id) : [...c.teacher_ids, t.id] })}
                  >
                    {t.name} <span className="faint tiny">&nbsp;{t.department}</span>
                  </button>
                );
              })}
            {!data.teachers.length && <span className="small faint">Add teachers first in the Teachers tab.</span>}
          </div>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="between">
          {c.id ? (
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${c.name}? Reports already sent are kept.`)) return;
                await act({ action: 'deleteCourse', id: c.id });
                toast('Course deleted');
                onClose();
              }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await act({ action: 'saveCourse', course: c, teacherIds: c.teacher_ids });
                toast('Course saved');
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

const BULK_COLS = ['Dept', 'Year', 'Batch', 'Code', 'Name', 'CrHr', 'Total chapters', 'Lab (Yes/No)', 'Lab sessions', 'Teacher'];

function BulkAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, act, toast } = useAdmin();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const rows = text
    .split('\n')
    .map((l) => l.replace(/\r/g, ''))
    .filter((l) => l.trim())
    .map((l) => l.split(l.includes('\t') ? '\t' : ',').map((x) => x.trim()))
    .filter((p) => !/^dept/i.test(p[0] ?? ''))
    .map((p) => ({
      department: (p[0] ?? '').toUpperCase(),
      year_of_study: Number(p[1]),
      batch: p[2] ?? '',
      code: p[3] ?? '',
      name: p[4] ?? '',
      crhr: p[5] ? Number(p[5]) : null,
      total_chapters: p[6] ? Number(p[6]) : null,
      has_lab: normYesNo(p[7]),
      total_lab_sessions: p[8] ? Number(p[8]) : null,
      teacher: p[9] ?? '',
      academic_year: data.period.academicYear,
      semester: data.period.semester,
    }));
  return (
    <Modal open={open} onClose={onClose} title="Paste a course list" wide>
      <div className="stack">
        <p className="small muted">
          Copy rows from Excel with these columns in this order (Teacher is optional and must match a name in the Teachers tab):
        </p>
        <div className="small mono" style={{ background: 'var(--bg)', padding: 10, borderRadius: 10, overflowX: 'auto' }}>
          {BULK_COLS.join(' | ')}
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 200, fontFamily: 'monospace', fontSize: '0.85rem' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'IT\t4\t2016\tITec4101\tWireless Networking\t5\t7\tYes\t5\tAbebe Kebede'}
        />
        <div className="small muted">
          {rows.length} course(s) will be added to {data.period.academicYear}, {data.period.semester}.
        </div>
        {err && <div className="alert error">{err}</div>}
        <button
          className="btn primary"
          disabled={!rows.length}
          onClick={async () => {
            try {
              const r = await act<{ added: number }>({ action: 'addCourses', courses: rows });
              toast(`${r.added} course(s) added`);
              setText('');
              onClose();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Add courses
        </button>
      </div>
    </Modal>
  );
}

type ImportResult = {
  format: 'offering' | 'qa';
  period?: string;
  department?: string;
  courses: number;
  updated: number;
  teachers: number;
  reports: number;
  skipped: number;
  problems: string[];
};

function ImportExcel({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { data } = useAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [withReports, setWithReports] = useState(true);
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Import from Excel">
      <div className="stack">
        <div className="small muted stack" style={{ gap: 6 }}>
          <div>
            <b>Course offering</b> (e.g. “SE - 2019 E.C SEM - I Course Offering.xlsx”) adds the lecturers, the courses with their class,
            students, lecture/lab/tutorial hours and sections, and who teaches what. The year and semester are read from the title.
          </div>
          <div>
            <b>QA report workbook</b> (QA_Course_Coverage_Report.xlsx) adds courses from the QA_Report sheet and, if ticked, their progress.
          </div>
          <div>The file type is detected automatically. Importing the same file again updates the courses instead of copying them.</div>
        </div>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label className="row small">
          Department of the offering file:
          <select className="select sm" style={{ width: 'auto' }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Detect from title</option>
            {data.settings.departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code}
              </option>
            ))}
          </select>
        </label>
        <label className="row small">
          <input type="checkbox" checked={withReports} onChange={(e) => setWithReports(e.target.checked)} />
          QA workbook only: also import chapters/labs covered as verified reports
        </label>
        {err && <div className="alert error">{err}</div>}
        {result && (
          <div className="alert ok small">
            {result.format === 'offering' ? (
              <>
                Course offering for <b>{result.department}</b>, {result.period}: added {result.courses} course(s), updated {result.updated}, added{' '}
                {result.teachers} lecturer(s).
              </>
            ) : (
              <>
                Added {result.courses} course(s) and {result.reports} report(s).
              </>
            )}{' '}
            {result.skipped ? `${result.skipped} row(s) skipped.` : ''}
            {result.problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
            <div style={{ marginTop: 6 }}>If the period differs from the one you are viewing, pick it in the period menu at the top.</div>
          </div>
        )}
        <button
          className="btn primary"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            setErr('');
            setResult(null);
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('reports', withReports ? '1' : '0');
              if (dept) fd.append('department', dept);
              const res = await fetch('/api/admin/import', { method: 'POST', body: fd });
              const j = await res.json();
              if (!res.ok) throw new Error(j.error || 'Import failed');
              setResult(j);
              await onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </Modal>
  );
}
