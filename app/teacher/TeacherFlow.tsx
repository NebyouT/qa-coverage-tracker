'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, deviceId, initials, periodLabel, store } from '@/lib/client';
import { score } from '@/lib/scoring';
import type { Course, PublicTeacher, Settings, TeacherReport } from '@/lib/types';
import { ChoiceChips, ErrorBox, Loading, Modal, NumberChips, Seg, StatusBadge, Stepper } from '@/components/ui';

type Boot = { settings: Settings; teachers: PublicTeacher[]; courses: Course[] };

type Draft = {
  key: string;
  courseId?: number;
  newCourse?: { code: string; name: string; yearOfStudy: number; batch: string; crhr: number | null };
  code: string;
  name: string;
  sub: string;
  totalChapters: number | null;
  chaptersCovered: number | null;
  hasLab: boolean | null;
  totalLabSessions: number | null;
  labsCovered: number | null;
  tags: string[];
  remarks: string;
  touched: boolean;
  last?: TeacherReport;
};

const subFor = (c: { year_of_study: number; batch: string; department: string }) =>
  `${c.department} · Year ${c.year_of_study}${c.batch ? ` · Batch ${c.batch}` : ''}`;

function isComplete(d: Draft) {
  if (!d.totalChapters || d.totalChapters < 1 || d.chaptersCovered === null || d.chaptersCovered > d.totalChapters) return false;
  if (d.hasLab === null) return false;
  if (d.hasLab && (!d.totalLabSessions || d.labsCovered === null || d.labsCovered > d.totalLabSessions)) return false;
  return true;
}

function draftFromCourse(c: Course, last?: TeacherReport): Draft {
  const known = c.total_chapters !== null;
  return {
    key: `c:${c.id}`,
    courseId: c.id,
    code: c.code,
    name: c.name,
    sub: subFor(c),
    totalChapters: last?.total_chapters ?? c.total_chapters,
    chaptersCovered: last?.chapters_covered ?? null,
    hasLab: last ? last.has_lab : known ? c.has_lab : null,
    totalLabSessions: last?.total_lab_sessions ?? c.total_lab_sessions,
    labsCovered: last?.labs_covered ?? null,
    tags: last?.tags ? last.tags.split('; ').filter(Boolean) : [],
    remarks: last?.remarks ?? '',
    touched: false,
    last,
  };
}

export default function TeacherFlow() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState('');
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<Draft[] | null>(null);

  const loadBoot = useCallback(async () => {
    setError('');
    try {
      const b = await api<Boot>('/api/public/bootstrap');
      setBoot(b);
      const saved = store.get<number | null>('qa.teacher', null);
      if (saved && b.teachers.some((t) => t.id === saved)) setTeacherId(saved);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  const loadMine = useCallback(async (id: number) => {
    setLoadingMine(true);
    setError('');
    try {
      const r = await api<{ courses: Course[]; reports: TeacherReport[] }>(`/api/public/teacher?id=${id}`);
      const d: Record<string, Draft> = {};
      const keys: string[] = [];
      for (const c of r.courses) {
        const last = r.reports.find((x) => x.course_id === c.id);
        const dr = draftFromCourse(c, last);
        d[dr.key] = dr;
        keys.push(dr.key);
      }
      setDrafts(d);
      setOrder(keys);
      setOpen(keys.find((k) => !d[k].last) ?? null);
    } catch (e) {
      setError((e as Error).message);
      if (/not found/i.test((e as Error).message)) {
        store.set('qa.teacher', null);
        setTeacherId(null);
      }
    } finally {
      setLoadingMine(false);
    }
  }, []);

  useEffect(() => {
    if (teacherId) loadMine(teacherId);
  }, [teacherId, loadMine]);

  const teacher = boot?.teachers.find((t) => t.id === teacherId) ?? null;

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => {
      const cur = { ...prev[key], ...patch, touched: true };
      if (cur.totalChapters !== null && cur.chaptersCovered !== null && cur.chaptersCovered > cur.totalChapters) cur.chaptersCovered = null;
      if (cur.totalLabSessions !== null && cur.labsCovered !== null && cur.labsCovered > cur.totalLabSessions) cur.labsCovered = null;
      return { ...prev, [key]: cur };
    });

  const ready = order.map((k) => drafts[k]).filter((d) => d && d.touched && isComplete(d));
  const touchedIncomplete = order.map((k) => drafts[k]).filter((d) => d && d.touched && !isComplete(d));

  async function submit() {
    if (!teacher || !ready.length) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api('/api/public/teacher', {
        action: 'submit',
        teacherId: teacher.id,
        device: deviceId(),
        items: ready.map((d) => ({
          courseId: d.courseId,
          newCourse: d.newCourse,
          totalChapters: d.totalChapters,
          chaptersCovered: d.chaptersCovered,
          hasLab: d.hasLab,
          totalLabSessions: d.hasLab ? d.totalLabSessions : null,
          labsCovered: d.hasLab ? d.labsCovered : null,
          tags: d.tags,
          remarks: d.remarks,
        })),
      });
      setDone(ready);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCourse(d: Draft) {
    if (!teacher) return;
    if (d.courseId && !d.newCourse) {
      try {
        await api('/api/public/teacher', { action: 'unlink', teacherId: teacher.id, courseId: d.courseId });
      } catch {
        /* the list still updates locally */
      }
    }
    setOrder((o) => o.filter((k) => k !== d.key));
    setOpen(null);
  }

  function addCourse(dr: Draft) {
    setDrafts((p) => ({ ...p, [dr.key]: p[dr.key] ?? dr }));
    setOrder((o) => (o.includes(dr.key) ? o : [...o, dr.key]));
    setOpen(dr.key);
    setPicker(false);
  }

  // ---------- render ----------
  if (error && !boot) return <Shell><ErrorBox error={error} onRetry={loadBoot} /></Shell>;
  if (!boot) return <Shell><Loading /></Shell>;
  const s = boot.settings;
  if (!s.teachersOpen) {
    return (
      <Shell period={periodLabel(s.period)}>
        <div className="alert info">Teacher reporting is closed at the moment. Please check back when the QA team opens it.</div>
      </Shell>
    );
  }

  if (!teacher) {
    return (
      <Shell period={periodLabel(s.period)}>
        <PickTeacher
          teachers={boot.teachers}
          departments={s.departments.map((d) => d.code)}
          onPick={(t) => {
            store.set('qa.teacher', t.id);
            setTeacherId(t.id);
          }}
        />
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell period={periodLabel(s.period)}>
        <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
          <div className="done-icon">✓</div>
          <h1>Thank you, {teacher.name.split(' ')[0]}!</h1>
          <p className="muted">
            {done.length} course report{done.length > 1 ? 's' : ''} sent to the QA team.
          </p>
        </div>
        <div className="stack">
          {done.map((d) => {
            const sc = score(
              {
                report_type: s.period.reportType,
                total_chapters: d.totalChapters,
                chapters_covered: d.chaptersCovered,
                has_lab: !!d.hasLab,
                total_lab_sessions: d.totalLabSessions,
                labs_covered: d.labsCovered,
              },
              s,
            );
            return (
              <div className="card tight between" key={d.key}>
                <div className="grow">
                  <div className="bold">{d.code}</div>
                  <div className="small muted">{d.name}</div>
                </div>
                <StatusBadge status={sc.status} tone={sc.tone} rate={sc.rate} />
              </div>
            );
          })}
        </div>
        <button
          className="btn block"
          onClick={() => {
            setDone(null);
            loadMine(teacher.id);
          }}
        >
          Back to my courses
        </button>
      </Shell>
    );
  }

  const myCourseIds = new Set(order.map((k) => drafts[k]?.courseId).filter(Boolean));

  return (
    <Shell period={periodLabel(s.period)}>
      <div className="between">
        <div className="row">
          <span className="avatar">{initials(teacher.name)}</span>
          <div>
            <div className="bold">{teacher.name}</div>
            <button
              className="link-btn small"
              onClick={() => {
                store.set('qa.teacher', null);
                setTeacherId(null);
                setDrafts({});
                setOrder([]);
              }}
            >
              Not you? Change
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={() => loadMine(teacher.id)} />}
      {loadingMine ? (
        <Loading />
      ) : (
        <>
          <div className="stack">
            <h2>Your courses</h2>
            {!order.length && (
              <div className="card muted small">
                No courses yet. Tap <b>Add a course</b> and pick the {s.period.semester} courses you teach.
              </div>
            )}
            {order.map((k) => {
              const d = drafts[k];
              if (!d) return null;
              return (
                <CourseCard
                  key={k}
                  d={d}
                  settings={s}
                  open={open === k}
                  onToggle={() => setOpen(open === k ? null : k)}
                  onChange={(patch) => update(k, patch)}
                  onRemove={() => removeCourse(d)}
                />
              );
            })}
            <button className="btn block" onClick={() => setPicker(true)}>
              ＋ Add a course
            </button>
          </div>

          {submitError && <div className="alert error">{submitError}</div>}

          <div className="sticky-bar">
            <div className="inner">
              <div className="grow small muted">
                {ready.length
                  ? `${ready.length} ready to send`
                  : touchedIncomplete.length
                    ? 'Finish the open course to send'
                    : 'Tap a course to report'}
              </div>
              <button className="btn primary lg" disabled={!ready.length || submitting} onClick={submit}>
                {submitting ? 'Sending…' : `Submit${ready.length ? ` (${ready.length})` : ''}`}
              </button>
            </div>
          </div>

          <AddCourseModal
            open={picker}
            onClose={() => setPicker(false)}
            courses={boot.courses.filter((c) => c.semester === s.period.semester && !myCourseIds.has(c.id))}
            teacherDept={teacher.department}
            years={s.years}
            onAdd={addCourse}
          />
        </>
      )}
    </Shell>
  );
}

function Shell({ children, period }: { children: React.ReactNode; period?: string }) {
  return (
    <main className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="logo">QA</span>
          <span>Teacher report</span>
        </Link>
        {period && <span className="pill">{period}</span>}
      </div>
      <div className="stack-lg">{children}</div>
    </main>
  );
}

function PickTeacher({
  teachers,
  departments,
  onPick,
}: {
  teachers: PublicTeacher[];
  departments: string[];
  onPick: (t: PublicTeacher) => void;
}) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<string>('All');
  const list = teachers.filter(
    (t) => (dept === 'All' || t.department === dept) && t.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="stack">
      <div>
        <h1>Who are you?</h1>
        <p className="muted">Tap your name. We will remember it on this phone.</p>
      </div>
      <input className="input" placeholder="Search your name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ChoiceChips
        options={['All', ...departments].map((d) => ({ value: d, label: d }))}
        value={dept}
        onChange={setDept}
      />
      <div className="stack" style={{ gap: 8 }}>
        {list.map((t) => (
          <button key={t.id} className="list-btn" onClick={() => onPick(t)}>
            <span className="avatar">{initials(t.name)}</span>
            <span className="grow">
              <span className="bold">{t.name}</span>
              <br />
              <span className="small muted">{t.department}</span>
            </span>
            <span className="faint">›</span>
          </button>
        ))}
        {!list.length && (
          <div className="card small muted">
            {teachers.length ? 'No name matches. Check the spelling or department.' : 'No teachers have been added yet.'} If your name is
            missing, ask the QA team to add it.
          </div>
        )}
      </div>
    </div>
  );
}

function CourseCard({
  d,
  settings,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  d: Draft;
  settings: Settings;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const complete = isComplete(d);
  const sc = useMemo(
    () =>
      score(
        {
          report_type: settings.period.reportType,
          total_chapters: d.totalChapters,
          chapters_covered: d.chaptersCovered,
          has_lab: !!d.hasLab,
          total_lab_sessions: d.totalLabSessions,
          labs_covered: d.labsCovered,
        },
        settings,
      ),
    [d, settings],
  );

  let badge: React.ReactNode = <span className="badge neutral">To report</span>;
  if (d.touched && complete) badge = <span className="badge info">Ready to send</span>;
  else if (d.last && !d.touched) badge = <span className="badge ok">✓ Reported</span>;

  return (
    <div className={`card${open ? ' active' : d.last && !d.touched ? ' ok' : ''}`} style={{ padding: 0 }}>
      <button
        onClick={onToggle}
        className="between"
        style={{ width: '100%', padding: 16, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexWrap: 'nowrap' }}
      >
        <div className="grow">
          <div className="bold">
            {d.code} <span style={{ fontWeight: 500 }}>· {d.name}</span>
          </div>
          <div className="small muted">{d.sub}</div>
        </div>
        {badge}
      </button>

      {open && (
        <div className="stack" style={{ padding: '0 16px 16px', gap: 18 }}>
          <div className="divider" />
          <div className="between">
            <span className="label">Total chapters in the course</span>
            <Stepper value={d.totalChapters} min={1} max={60} onChange={(v) => onChange({ totalChapters: v })} label="Total chapters" />
          </div>

          <div className="field">
            <span className="label">Chapters covered so far</span>
            {d.totalChapters ? (
              d.totalChapters <= 30 ? (
                <NumberChips max={d.totalChapters} value={d.chaptersCovered} onChange={(v) => onChange({ chaptersCovered: v })} />
              ) : (
                <Stepper value={d.chaptersCovered} max={d.totalChapters} onChange={(v) => onChange({ chaptersCovered: v })} />
              )
            ) : (
              <span className="small faint">Set total chapters first</span>
            )}
          </div>

          <div className="between">
            <span className="label">Does this course have a lab?</span>
            <Seg
              options={[
                { value: false, label: 'No lab' },
                { value: true, label: 'Has lab' },
              ]}
              value={d.hasLab}
              onChange={(v) => onChange({ hasLab: v, totalLabSessions: v ? d.totalLabSessions ?? 8 : d.totalLabSessions })}
            />
          </div>

          {d.hasLab && (
            <>
              <div className="between">
                <span className="label">Total lab sessions</span>
                <Stepper value={d.totalLabSessions} min={1} max={100} onChange={(v) => onChange({ totalLabSessions: v })} label="Total lab sessions" />
              </div>
              <div className="field">
                <span className="label">Lab sessions done so far</span>
                {d.totalLabSessions && d.totalLabSessions <= 20 ? (
                  <NumberChips max={d.totalLabSessions} value={d.labsCovered} onChange={(v) => onChange({ labsCovered: v })} />
                ) : (
                  <Stepper value={d.labsCovered} max={d.totalLabSessions ?? 100} onChange={(v) => onChange({ labsCovered: v })} />
                )}
              </div>
            </>
          )}

          {settings.tags.length > 0 && (
            <div className="field">
              <span className="label">Quick notes (optional)</span>
              <div className="chips">
                {settings.tags.map((t) => {
                  const on = d.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`chip soft${on ? ' on' : ''}`}
                      onClick={() => onChange({ tags: on ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <input
            className="input"
            placeholder="Other remark (optional)"
            value={d.remarks}
            maxLength={500}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />

          <div className="between">
            {sc.rate !== null ? (
              <span className="small">
                Coverage: <b>{Math.round((sc.lecture ?? 0) * 100)}%</b>
                {sc.lab !== null && (
                  <>
                    {' '}
                    · Lab <b>{Math.round(sc.lab * 100)}%</b>
                  </>
                )}
              </span>
            ) : (
              <span className="small faint">Pick chapters covered to see the result</span>
            )}
            {sc.rate !== null && <StatusBadge status={sc.status} tone={sc.tone} rate={sc.rate} />}
          </div>

          {!d.last && (
            <button className="link-btn small danger" style={{ alignSelf: 'flex-start', color: 'var(--err)' }} onClick={onRemove}>
              Not my course — remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddCourseModal({
  open,
  onClose,
  courses,
  teacherDept,
  years,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  teacherDept: string;
  years: number[];
  onAdd: (d: Draft) => void;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ code: '', name: '', yearOfStudy: 0, batch: '', crhr: '' });

  useEffect(() => {
    if (open) {
      setQ('');
      setCreating(false);
      setNc({ code: '', name: '', yearOfStudy: 0, batch: '', crhr: '' });
    }
  }, [open]);

  const term = q.trim().toLowerCase();
  const list = courses
    .filter((c) => all || !teacherDept || c.department === teacherDept)
    .filter((c) => !term || `${c.code} ${c.name}`.toLowerCase().includes(term));

  const canCreate = nc.code.trim() && nc.name.trim() && nc.yearOfStudy;

  return (
    <Modal open={open} onClose={onClose} title={creating ? 'New course' : 'Add a course'}>
      {!creating ? (
        <div className="stack">
          <input className="input" placeholder="Search code or name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {teacherDept && (
            <Seg
              options={[
                { value: false, label: `${teacherDept} only` },
                { value: true, label: 'All departments' },
              ]}
              value={all}
              onChange={setAll}
            />
          )}
          <div className="stack" style={{ gap: 8, maxHeight: '45vh', overflow: 'auto' }}>
            {list.map((c) => (
              <button key={c.id} className="list-btn" onClick={() => onAdd(draftFromCourse(c))}>
                <span className="grow">
                  <span className="bold">{c.code}</span> · {c.name}
                  <br />
                  <span className="small muted">{subFor(c)}</span>
                </span>
                <span className="pill">Add</span>
              </button>
            ))}
            {!list.length && <div className="small muted">No matching course in the list.</div>}
          </div>
          <button
            className="btn block"
            onClick={() => {
              setCreating(true);
              setNc((n) => ({ ...n, code: /\d/.test(q) ? q : '', name: /\d/.test(q) ? '' : q }));
            }}
          >
            Can&apos;t find it? Add a new course
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="grid-2">
            <label className="field">
              <span className="label">Course code</span>
              <input className="input" value={nc.code} placeholder="e.g. ITec3041" onChange={(e) => setNc({ ...nc, code: e.target.value })} autoFocus />
            </label>
            <label className="field">
              <span className="label">Credit hours (optional)</span>
              <input className="input" inputMode="decimal" value={nc.crhr} onChange={(e) => setNc({ ...nc, crhr: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Course name</span>
            <input className="input" value={nc.name} placeholder="e.g. Database Systems" onChange={(e) => setNc({ ...nc, name: e.target.value })} />
          </label>
          <div className="field">
            <span className="label">Year of study</span>
            <ChoiceChips options={years.map((y) => ({ value: y, label: `Year ${y}` }))} value={nc.yearOfStudy || null} onChange={(v) => setNc({ ...nc, yearOfStudy: v })} />
          </div>
          <label className="field">
            <span className="label">Batch (optional)</span>
            <input className="input" value={nc.batch} placeholder="e.g. 2016" onChange={(e) => setNc({ ...nc, batch: e.target.value })} />
          </label>
          <div className="row">
            <button className="btn" onClick={() => setCreating(false)}>
              Back
            </button>
            <button
              className="btn primary grow"
              disabled={!canCreate}
              onClick={() =>
                onAdd({
                  key: `n:${Date.now()}`,
                  newCourse: {
                    code: nc.code.trim(),
                    name: nc.name.trim(),
                    yearOfStudy: nc.yearOfStudy,
                    batch: nc.batch.trim(),
                    crhr: nc.crhr ? Number(nc.crhr) || null : null,
                  },
                  code: nc.code.trim(),
                  name: nc.name.trim(),
                  sub: subFor({ department: teacherDept, year_of_study: nc.yearOfStudy, batch: nc.batch.trim() }),
                  totalChapters: null,
                  chaptersCovered: null,
                  hasLab: null,
                  totalLabSessions: null,
                  labsCovered: null,
                  tags: [],
                  remarks: '',
                  touched: true,
                })
              }
            >
              Add course
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
