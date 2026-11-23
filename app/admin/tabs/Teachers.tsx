'use client';

import { useMemo, useState } from 'react';
import { summarizeTeachers } from '@/lib/consolidate';
import { fmtDate } from '@/lib/client';
import { pct } from '@/lib/scoring';
import type { Teacher } from '@/lib/types';
import { Modal } from '@/components/ui';
import { useAdmin } from '../shared';

export default function Teachers() {
  const { data, rows, act, goto, toast } = useAdmin();
  const s = data.settings;
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [defDept, setDefDept] = useState(s.departments[0]?.code ?? '');
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const summary = useMemo(() => summarizeTeachers(rows, data.teachers), [rows, data.teachers]);
  const list = summary.filter((t) => `${t.name} ${t.department}`.toLowerCase().includes(q.trim().toLowerCase()));

  const parsed = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t|,|;/).map((x) => x.trim());
      const maybeDept = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
      const isDept = s.departments.some((d) => d.code.toUpperCase() === maybeDept);
      return { name: isDept ? parts.slice(0, -1).join(' ') : parts.join(' '), department: isDept ? maybeDept : defDept };
    });

  return (
    <div className="stack">
      <div className="filters">
        <input className="input sm" placeholder="Search teachers" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        <button className="btn sm primary" onClick={() => setAdding(true)}>
          ＋ Add teachers
        </button>
      </div>
      <div className="small muted">
        Teachers search for their name in this list; a teacher who is missing can add their name (marked New until you approve or fix
        it). Click a row to see that teacher&apos;s courses in the course report.
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Dept</th>
              <th className="num">Courses</th>
              <th className="num">Reported</th>
              <th className="num">Avg performance</th>
              <th className="num">Open issues</th>
              <th>Last report</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.teacher!.id} className={`click${t.teacher!.active ? '' : ' dim'}`} onClick={() => goto('report', { teacherId: t.teacher!.id })}>
                <td className="bold">
                  {t.name} {t.teacher!.source === 'teacher' && <span className="badge info">New — added by teacher</span>}
                </td>
                <td>{t.department}</td>
                <td className="num">{t.courses}</td>
                <td className="num">
                  {t.courses ? (
                    <span className={`badge ${t.reported >= t.courses ? 'ok' : t.reported ? 'warn' : 'error'}`}>
                      {t.reported} / {t.courses}
                    </span>
                  ) : (
                    <span className="faint">–</span>
                  )}
                </td>
                <td className="num">{pct(t.avgRate, 1)}</td>
                <td className="num">{t.flags || <span className="faint">0</span>}</td>
                <td className="small">{t.lastReport ? fmtDate(t.lastReport) : <span className="faint">never</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    {t.teacher!.source === 'teacher' && (
                      <button
                        className="btn xs"
                        onClick={async () => {
                          await act({ action: 'updateTeacher', ...t.teacher!, source: 'admin' });
                          toast('Teacher approved');
                        }}
                      >
                        Approve
                      </button>
                    )}
                    <button className="btn xs" onClick={() => setEditing(t.teacher)}>
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={8} className="center muted" style={{ padding: 30 }}>
                  No teachers yet. Click “Add teachers” and paste the list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add teachers">
        <div className="stack">
          <p className="small muted">
            One teacher per line. You can add the department after a comma, e.g. <code>Abebe Kebede, IT</code>. You can paste two columns
            straight from Excel.
          </p>
          <textarea className="textarea" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Abebe Kebede, IT\nSara Tesfaye, CS'} autoFocus />
          <label className="row small">
            Department when not given:
            <select className="select sm" style={{ width: 'auto' }} value={defDept} onChange={(e) => setDefDept(e.target.value)}>
              {s.departments.map((d) => (
                <option key={d.code}>{d.code}</option>
              ))}
            </select>
          </label>
          {parsed.length > 0 && <div className="small muted">{parsed.length} teacher(s) will be added. Names already in the list are skipped.</div>}
          <button
            className="btn primary"
            disabled={!parsed.length}
            onClick={async () => {
              const r = await act<{ added: number }>({ action: 'addTeachers', teachers: parsed });
              toast(`${r.added} teacher(s) added`);
              setText('');
              setAdding(false);
            }}
          >
            Add {parsed.length || ''}
          </button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit teacher">
        {editing && (
          <div className="stack">
            <label className="field">
              <span className="label">Name</span>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Department</span>
              <select className="select" value={editing.department} onChange={(e) => setEditing({ ...editing, department: e.target.value })}>
                {s.departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Show in the teacher list
            </label>
            {err && <div className="alert error">{err}</div>}
            <div className="between">
              <button
                className="btn danger sm"
                onClick={async () => {
                  if (!window.confirm(`Delete ${editing.name}? Their past reports are kept but no longer linked. Untick "Show in the teacher list" instead if you only want to hide them.`)) return;
                  await act({ action: 'deleteTeacher', id: editing.id });
                  toast('Teacher deleted');
                  setEditing(null);
                }}
              >
                Delete
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await act({ action: 'updateTeacher', ...editing });
                    toast('Saved');
                    setEditing(null);
                    setErr('');
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
