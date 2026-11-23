'use client';

import { useEffect, useState } from 'react';
import type { Band, Settings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { useAdmin } from '../shared';

export default function SettingsTab() {
  const { data, act, toast } = useAdmin();
  const [s, setS] = useState<Settings>(data.settings);
  const [err, setErr] = useState('');
  useEffect(() => setS(data.settings), [data.settings]);

  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <div className="card stack">
        <h2>General</h2>
        <label className="field">
          <span className="label">School / faculty name</span>
          <input className="input sm" value={s.schoolName} onChange={(e) => setS({ ...s, schoolName: e.target.value })} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span className="label">Years of study (comma separated)</span>
            <input
              className="input sm"
              defaultValue={s.years.join(', ')}
              key={`y${s.years.join()}`}
              onBlur={(e) => setS({ ...s, years: list(e.target.value).map(Number).filter((n) => n > 0) })}
            />
          </label>
          <label className="field">
            <span className="label">Semesters</span>
            <input className="input sm" defaultValue={s.semesters.join(', ')} key={`s${s.semesters.join()}`} onBlur={(e) => setS({ ...s, semesters: list(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Report types</span>
            <input className="input sm" defaultValue={s.reportTypes.join(', ')} key={`r${s.reportTypes.join()}`} onBlur={(e) => setS({ ...s, reportTypes: list(e.target.value) })} />
          </label>
        </div>
      </div>

      <div className="card stack">
        <div className="between">
          <h2>Departments (QA teams)</h2>
          <button className="btn sm" onClick={() => setS({ ...s, departments: [...s.departments, { code: '', name: '' }] })}>
            ＋ Add
          </button>
        </div>
        {s.departments.map((d, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="input sm"
              style={{ width: 100 }}
              placeholder="Code"
              value={d.code}
              onChange={(e) => setS({ ...s, departments: s.departments.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })}
            />
            <input
              className="input sm grow"
              placeholder="Full name"
              value={d.name}
              onChange={(e) => setS({ ...s, departments: s.departments.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
            />
            <button className="btn xs danger" onClick={() => setS({ ...s, departments: s.departments.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>Performance rate</h2>
        <p className="small muted">
          Performance = Lecture % × lecture weight + Lab % × (1 − lecture weight). Courses without a lab use the lecture % only — same as the
          Excel workbook.
        </p>
        <div className="grid-3">
          <label className="field">
            <span className="label">Lecture weight (%)</span>
            <input
              className="input sm"
              inputMode="numeric"
              value={Math.round(s.lectureWeight * 100)}
              onChange={(e) => setS({ ...s, lectureWeight: Math.min(Math.max(Number(e.target.value) || 0, 0), 100) / 100 })}
            />
          </label>
          <div className="field">
            <span className="label">Lab weight (%)</span>
            <div className="input sm" style={{ background: 'var(--bg)' }}>
              {Math.round((1 - s.lectureWeight) * 100)}
            </div>
          </div>
          <label className="field">
            <span className="label">Flag when students differ by (chapters)</span>
            <input className="input sm" inputMode="numeric" value={s.gapThreshold} onChange={(e) => setS({ ...s, gapThreshold: Number(e.target.value) || 1 })} />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span className="label">Teaching weeks per semester</span>
            <input
              className="input sm"
              inputMode="numeric"
              value={s.weeksPerSemester}
              onChange={(e) => setS({ ...s, weeksPerSemester: Number(e.target.value) || 16 })}
            />
          </label>
          <label className="field">
            <span className="label">Flag lab sections apart by (sessions)</span>
            <input
              className="input sm"
              inputMode="numeric"
              value={s.labGapThreshold}
              onChange={(e) => setS({ ...s, labGapThreshold: Number(e.target.value) || 3 })}
            />
          </label>
        </div>
        <p className="small muted">
          A course with lab hours starts with “lab sessions planned” = teaching weeks (one lab session a week). Teachers can change it. With
          several lab sections the lab % uses the average of the sections.
        </p>
      </div>

      <div className="grid-2">
        <BandsEditor title="Mid-term status bands" bands={s.midBands} onChange={(b) => setS({ ...s, midBands: b })} />
        <BandsEditor title="Final status bands" bands={s.finalBands} onChange={(b) => setS({ ...s, finalBands: b })} />
      </div>

      <div className="card stack">
        <div className="between">
          <h2>Yes / No questions (teachers and students)</h2>
          <button
            className="btn sm"
            onClick={() => setS({ ...s, questions: [...s.questions, { key: `q${s.questions.length + 1}`, teacher: '', student: '' }] })}
          >
            ＋ Add
          </button>
        </div>
        <p className="small muted">
          Asked for every course. The course report compares the teacher&apos;s answer with what most students say. “Lab only” questions are
          asked only for courses with a lab; teachers answer them through the lab sessions number.
        </p>
        {s.questions.map((qn, i) => {
          const set = (p: Partial<typeof qn>) => setS({ ...s, questions: s.questions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="grid-3" style={{ alignItems: 'end' }}>
              <label className="field">
                <span className="label">Teacher wording</span>
                <input className="input sm" value={qn.teacher} onChange={(e) => set({ teacher: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Student wording</span>
                <input className="input sm" value={qn.student} onChange={(e) => set({ student: e.target.value })} />
              </label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <label className="row small">
                  <input type="checkbox" checked={!!qn.labOnly} onChange={(e) => set({ labOnly: e.target.checked })} /> Lab only
                </label>
                <button className="btn xs danger" onClick={() => setS({ ...s, questions: s.questions.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card stack">
        <h2>Other quick notes for teachers</h2>
        <p className="small muted">One per line. Teachers tap these instead of typing remarks.</p>
        <textarea
          className="textarea"
          defaultValue={s.tags.join('\n')}
          key={s.tags.join('|')}
          onBlur={(e) => setS({ ...s, tags: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
        />
      </div>

      {err && <div className="alert error">{err}</div>}
      <div className="row">
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await act({ action: 'saveSettings', settings: s });
              toast('Settings saved');
              setErr('');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Save settings
        </button>
        <button className="btn" onClick={() => setS(data.settings)}>
          Undo changes
        </button>
        <button
          className="btn ghost"
          onClick={() => setS({ ...DEFAULT_SETTINGS, period: s.period, departments: s.departments, teachersOpen: s.teachersOpen, studentsOpen: s.studentsOpen })}
        >
          Reset everything except period & departments to defaults
        </button>
      </div>
    </div>
  );
}

function BandsEditor({ title, bands, onChange }: { title: string; bands: Band[]; onChange: (b: Band[]) => void }) {
  return (
    <div className="card stack">
      <div className="between">
        <h3>{title}</h3>
        <button className="btn xs" onClick={() => onChange([...bands, { name: 'New band', from: 1 }])}>
          ＋ Add
        </button>
      </div>
      <div className="small muted">“From %” is the lowest performance rate for that status.</div>
      {bands.map((b, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            className="input sm"
            style={{ width: 74 }}
            inputMode="numeric"
            value={Math.round(b.from * 100)}
            onChange={(e) => onChange(bands.map((x, j) => (j === i ? { ...x, from: (Number(e.target.value) || 0) / 100 } : x)))}
            aria-label="From %"
          />
          <span className="small muted">%</span>
          <input className="input sm grow" value={b.name} onChange={(e) => onChange(bands.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <button className="btn xs danger" onClick={() => onChange(bands.filter((_, j) => j !== i))} aria-label="Remove">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
