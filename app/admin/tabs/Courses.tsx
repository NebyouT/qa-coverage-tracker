'use client';

import { useMemo, useState } from 'react';
import type { Course } from '@/lib/types';
import { normYesNo } from '@/lib/normalize';
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
    if (term && !`${c.code} ${c.name}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const blank = (): Edit => ({
    academic_year: data.period.academicYear,
    semester: data.period.semester,
    department: dept || s.departments[0]?.code || '',
    year_of_study: s.years[0] ?? 1,
    batch: '',
    code: '',
    name: '',
    crhr: null,
    total_chapters: null,
    has_lab: false,
    total_lab_sessions: null,
    source: 'admin',
    teacher_ids: [],
  });

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select sm" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {s.departments.map((d) => (
            <option key={d.code}>{d.code}</option>
          ))}
        </select>
        <span className="grow" />
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
        Course list for {data.period.academicYear}, {data.period.semester}. Students see these by department and year; teachers pick from them.
        Courses added by teachers are marked <span className="badge info">New</span> until you approve them.
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Dept</th>
              <th className="num">Year</th>
              <th>Batch</th>
              <th className="num">CrHr</th>
              <th className="num">Chapters</th>
              <th className="num">Lab sessions</th>
              <th>Teachers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="click" onClick={() => setEditing({ ...c })}>
                <td className="bold">
                  {c.code} {c.source === 'teacher' && <span className="badge info">New</span>}
                </td>
                <td>{c.name}</td>
                <td>{c.department}</td>
                <td className="num">{c.year_of_study}</td>
                <td>{c.batch || <span className="faint">–</span>}</td>
                <td className="num">{c.crhr ?? <span className="faint">–</span>}</td>
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
                <td colSpan={10} className="center muted" style={{ padding: 30 }}>
                  No courses yet. Import your Excel file, paste a list, or add them one by one.
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
    <Modal open={!!course} onClose={onClose} title={c.id ? `Edit ${c.code}` : 'Add course'}>
      <div className="stack">
        <div className="grid-2">
          <label className="field">
            <span className="label">Course code</span>
            <input className="input sm" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value })} autoFocus={!c.id} />
          </label>
          <label className="field">
            <span className="label">Department</span>
            <select className="select sm" value={c.department} onChange={(e) => setC({ ...c, department: e.target.value })}>
              {s.departments.map((d) => (
                <option key={d.code}>{d.code}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="label">Course name</span>
          <input className="input sm" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </label>
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
              <span className="label">Lab sessions</span>
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
                if (!window.confirm(`Delete ${c.code}? Reports already sent are kept.`)) return;
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

function ImportExcel({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [withReports, setWithReports] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ courses: number; reports: number; skipped: number; problems: string[] } | null>(null);
  const [err, setErr] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Import from the Excel workbook">
      <div className="stack">
        <p className="small muted">
          Choose your <b>QA_Course_Coverage_Report.xlsx</b>. Every row on the QA_Report sheet becomes a course (spelling like “semester ll” or
          “2019E.C” is fixed automatically). Courses already in the list are skipped.
        </p>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label className="row small">
          <input type="checkbox" checked={withReports} onChange={(e) => setWithReports(e.target.checked)} />
          Also import the chapters/labs covered as verified reports
        </label>
        {err && <div className="alert error">{err}</div>}
        {result && (
          <div className="alert ok small">
            Added {result.courses} course(s) and {result.reports} report(s). {result.skipped ? `${result.skipped} row(s) skipped.` : ''}
            {result.problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
            <div style={{ marginTop: 6 }}>Imported data goes to the academic year and semester written in each row. Use the period menu at the top to view it.</div>
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
