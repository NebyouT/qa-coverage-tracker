'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, deviceId, initials, periodLabel, store } from '@/lib/client';
import { classLabel, parseAnswers, parseSections, studentDepartments } from '@/lib/normalize';
import { score } from '@/lib/scoring';
import type { Answers, Course, PublicTeacher, Settings, TeacherReport } from '@/lib/types';
import { ChoiceChips, ErrorBox, Loading, Modal, NumberChips, Seg, StatusBadge, Stepper, YesNo } from '@/components/ui';

type Boot = { settings: Settings; teachers: PublicTeacher[]; courses: Course[] };

type Draft = {
  key: string;
  courseId?: number;
  newCourse?: { code: string; name: string; yearOfStudy: number; batch: string; crhr: number | null; studentDept: string; section: string };
  code: string;
  name: string;
  sub: string;
  /** Facts from the course offering, shown instead of asking */
  facts: string[];
  labKnown: boolean;
  labSections: number;
  hasTutorial: boolean;
  totalChapters: number | null;
  chaptersCovered: number | null;
  hasLab: boolean | null;
  totalLabSessions: number | null;
  labsCovered: number | null;
  labsBySection: (number | null)[];
  tutorialsDone: number | null;
  answers: Answers;
  tags: string[];
  remarks: string;
  touched: boolean;
  last?: TeacherReport;
};

const subFor = (c: { year_of_study: number; batch: string; department: string; student_dept?: string; section?: string }) =>
  `${classLabel(c)} · Year ${c.year_of_study}${c.batch ? ` · Batch ${c.batch}` : ''}`;

const hrs = (v: number | null) => (v === null ? '' : `${v}h`);

function factsFor(c: Course): string[] {
  const f: string[] = [];
  if (c.crhr) f.push(`${c.crhr} CrHr`);
  if (c.lec_hours) f.push(`Lecture ${hrs(c.lec_hours)}/wk`);
  if (c.lab_hours) f.push(`Lab ${hrs(c.lab_hours)}/wk${(c.lab_sections ?? 1) > 1 ? ` · ${c.lab_sections} lab sections` : ''}`);
  if (c.tut_hours) f.push(`Tutorial ${hrs(c.tut_hours)}/wk`);
  if (c.students) f.push(`${c.students} students`);
  return f;
}

function isComplete(d: Draft) {
  if (!d.totalChapters || d.totalChapters < 1 || d.chaptersCovered === null || d.chaptersCovered > d.totalChapters) return false;
  if (d.hasLab === null) return false;
  if (d.hasLab) {
    if (!d.totalLabSessions) return false;
    if (d.labSections > 1) return d.labsBySection.length >= d.labSections && d.labsBySection.slice(0, d.labSections).every((v) => v !== null && v <= d.totalLabSessions!);
    if (d.labsCovered === null || d.labsCovered > d.totalLabSessions) return false;
  }
  return true;
}

function draftFromCourse(c: Course, s: Settings, last?: TeacherReport): Draft {
  const labKnown = c.lab_hours !== null || (c.total_chapters !== null && !last);
  const labSections = c.has_lab ? Math.max(c.lab_sections ?? 1, 1) : 1;
  const prevSections = parseSections(last?.labs_by_section);
  return {
    key: `c:${c.id}`,
    courseId: c.id,
    code: c.code,
    name: c.name,
    sub: subFor(c),
    facts: factsFor(c),
    labKnown: c.lab_hours !== null,
    labSections,
    hasTutorial: (c.tut_hours ?? 0) > 0,
    totalChapters: last?.total_chapters ?? c.total_chapters,
    chaptersCovered: last?.chapters_covered ?? null,
    hasLab: last ? last.has_lab : labKnown ? c.has_lab : null,
    totalLabSessions: last?.total_lab_sessions ?? c.total_lab_sessions ?? (c.has_lab ? s.weeksPerSemester : null),
    labsCovered: last?.labs_covered ?? null,
    labsBySection: Array.from({ length: labSections }, (_, i) => prevSections[i] ?? (labSections === 1 ? last?.labs_covered ?? null : null)),
    tutorialsDone: last?.tutorials_done ?? null,
    answers: parseAnswers(last?.answers),
    tags: last?.tags ? last.tags.split('; ').filter(Boolean) : [],
    remarks: last?.remarks ?? '',
    touched: false,
    last,
  };
}

export default function TeacherFlow() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState('');
  const [teacher, setTeacher] = useState<PublicTeacher | null>(null);
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
      const t = saved ? b.teachers.find((x) => x.id === saved) : undefined;
      if (t) setTeacher(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  const loadMine = useCallback(
    async (id: number) => {
      if (!boot) return;
      setLoadingMine(true);
      setError('');
      try {
        const r = await api<{ courses: Course[]; reports: TeacherReport[] }>(`/api/public/teacher?id=${id}`);
        const d: Record<string, Draft> = {};
        const keys: string[] = [];
        for (const c of r.courses) {
          const last = r.reports.find((x) => x.course_id === c.id);
          const dr = draftFromCourse(c, boot.settings, last);
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
          setTeacher(null);
        }
      } finally {
        setLoadingMine(false);
      }
    },
    [boot],
  );

  useEffect(() => {
    if (teacher) loadMine(teacher.id);
  }, [teacher, loadMine]);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => {
      const cur = { ...prev[key], ...patch, touched: true };
      if (cur.totalChapters !== null && cur.chaptersCovered !== null && cur.chaptersCovered > cur.totalChapters) cur.chaptersCovered = null;
      if (cur.totalLabSessions !== null) {
        if (cur.labsCovered !== null && cur.labsCovered > cur.totalLabSessions) cur.labsCovered = null;
        cur.labsBySection = cur.labsBySection.map((v) => (v !== null && v > cur.totalLabSessions! ? null : v));
      }
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
          labsCovered: d.hasLab ? (d.labSections > 1 ? null : d.labsCovered) : null,
          labsBySection: d.hasLab && d.labSections > 1 ? d.labsBySection.slice(0, d.labSections) : undefined,
          tutorialsDone: d.tutorialsDone,
          answers: d.answers,
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
            setTeacher(t);
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
            const sc = scoreDraft(d, s);
            return (
              <div className="card tight between" key={d.key}>
                <div className="grow">
                  <div className="bold">{d.name}</div>
                  <div className="small muted">{d.sub}</div>
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
      <div className="row">
        <span className="avatar">{initials(teacher.name)}</span>
        <div>
          <div className="bold">{teacher.name}</div>
          <button
            className="link-btn small"
            onClick={() => {
              store.set('qa.teacher', null);
              setTeacher(null);
              setDrafts({});
              setOrder([]);
            }}
          >
            Not you? Change
          </button>
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
            teachers={boot.teachers}
            teacherDept={teacher.department}
            classes={studentDepartments(
              s.departments.map((d) => d.code),
              boot.courses,
            )}
            settings={s}
            onAdd={addCourse}
          />
        </>
      )}
    </Shell>
  );
}

function scoreDraft(d: Draft, s: Settings) {
  const labs = d.labSections > 1 ? avgOf(d.labsBySection.slice(0, d.labSections)) : d.labsCovered;
  return score(
    {
      report_type: s.period.reportType,
      total_chapters: d.totalChapters,
      chapters_covered: d.chaptersCovered,
      has_lab: !!d.hasLab,
      total_lab_sessions: d.totalLabSessions,
      labs_covered: labs,
    },
    s,
  );
}

function avgOf(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
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
  const [adding, setAdding] = useState(false);
  const [newDept, setNewDept] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const term = q.trim().toLowerCase();
  const list = teachers.filter((t) => (dept === 'All' || t.department === dept) && t.name.toLowerCase().includes(term));

  if (adding) {
    return (
      <div className="stack">
        <div>
          <h1>Add your name</h1>
          <p className="muted">The QA team will check it. You can report right away.</p>
        </div>
        <label className="field">
          <span className="label">Full name</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="e.g. Abebe Kebede" />
        </label>
        <div className="field">
          <span className="label">Your department</span>
          <ChoiceChips options={departments.map((d) => ({ value: d, label: d }))} value={newDept} onChange={setNewDept} />
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="row">
          <button className="btn" onClick={() => setAdding(false)}>
            Back
          </button>
          <button
            className="btn primary grow"
            disabled={q.trim().length < 3 || !newDept || busy}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                const r = await api<{ teacher: PublicTeacher }>('/api/public/teacher', { action: 'register', name: q.trim(), department: newDept });
                onPick(r.teacher);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <h1>Who are you?</h1>
        <p className="muted">Type part of your name and tap it. We remember it on this phone.</p>
      </div>
      <input className="input" placeholder="Search your name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {departments.length > 1 && (
        <ChoiceChips options={['All', ...departments].map((d) => ({ value: d, label: d }))} value={dept} onChange={setDept} />
      )}
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
        {!list.length && <div className="small muted">No name matches “{q}”.</div>}
        <button
          className="list-btn"
          style={{ borderStyle: 'dashed' }}
          onClick={() => {
            setNewDept(dept !== 'All' ? dept : null);
            setAdding(true);
          }}
        >
          <span className="avatar">＋</span>
          <span className="grow">
            <span className="bold">My name isn&apos;t listed</span>
            <br />
            <span className="small muted">Add it — {q.trim() ? `“${q.trim()}”` : 'takes a few seconds'}</span>
          </span>
        </button>
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
  const sc = useMemo(() => scoreDraft(d, settings), [d, settings]);

  let badge: React.ReactNode = <span className="badge neutral">To report</span>;
  if (d.touched && complete) badge = <span className="badge info">Ready to send</span>;
  else if (d.last && !d.touched) badge = <span className="badge ok">✓ Reported</span>;

  const labChips = (value: number | null, set: (v: number) => void) =>
    d.totalLabSessions && d.totalLabSessions <= 20 ? (
      <NumberChips max={d.totalLabSessions} value={value} onChange={set} />
    ) : (
      <Stepper value={value} max={d.totalLabSessions ?? 100} onChange={set} />
    );

  return (
    <div className={`card${open ? ' active' : d.last && !d.touched ? ' ok' : ''}`} style={{ padding: 0 }}>
      <button
        onClick={onToggle}
        className="between"
        style={{ width: '100%', padding: 16, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexWrap: 'nowrap' }}
      >
        <div className="grow">
          <div className="bold">
            {d.name}
            {d.code && <span className="muted" style={{ fontWeight: 500 }}> · {d.code}</span>}
          </div>
          <div className="small muted">{d.sub}</div>
        </div>
        {badge}
      </button>

      {open && (
        <div className="stack" style={{ padding: '0 16px 16px', gap: 18 }}>
          {d.last && (
            <div className="alert info small">
              You already reported this course on {new Date(d.last.created_at).toLocaleDateString('en-GB')}. Sending again adds a new report;
              your first one is kept and the QA team decides which to use.
            </div>
          )}
          {d.facts.length > 0 && (
            <div className="chips">
              {d.facts.map((f) => (
                <span key={f} className="badge neutral">
                  {f}
                </span>
              ))}
            </div>
          )}
          <div className="divider" />
          {d.totalChapters === null || d.totalChapters <= 15 ? (
            <div className="field">
              <span className="label">Total chapters in the course</span>
              <NumberChips min={1} max={15} value={d.totalChapters} onChange={(v) => onChange({ totalChapters: v })} />
            </div>
          ) : (
            <div className="between">
              <span className="label">Total chapters in the course</span>
              <Stepper value={d.totalChapters} min={1} max={60} onChange={(v) => onChange({ totalChapters: v })} label="Total chapters" />
            </div>
          )}

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

          {!d.labKnown && (
            <div className="between">
              <span className="label">Does this course have a lab?</span>
              <Seg
                options={[
                  { value: false, label: 'No lab' },
                  { value: true, label: 'Has lab' },
                ]}
                value={d.hasLab}
                onChange={(v) => onChange({ hasLab: v, totalLabSessions: v ? d.totalLabSessions ?? settings.weeksPerSemester : d.totalLabSessions })}
              />
            </div>
          )}

          {d.hasLab && (
            <>
              <div className="between">
                <span className="label">Lab sessions planned{d.labSections > 1 ? ' (each section)' : ''}</span>
                <Stepper value={d.totalLabSessions} min={1} max={100} onChange={(v) => onChange({ totalLabSessions: v })} label="Total lab sessions" />
              </div>
              {d.labSections > 1 ? (
                Array.from({ length: d.labSections }, (_, i) => (
                  <div className="field" key={i}>
                    <span className="label">Lab section {i + 1}: sessions done</span>
                    {labChips(d.labsBySection[i] ?? null, (v) => {
                      const next = [...d.labsBySection];
                      next[i] = v;
                      onChange({ labsBySection: next });
                    })}
                  </div>
                ))
              ) : (
                <div className="field">
                  <span className="label">Lab sessions done so far</span>
                  {labChips(d.labsCovered, (v) => onChange({ labsCovered: v }))}
                </div>
              )}
            </>
          )}

          {d.hasTutorial && (
            <div className="between">
              <span className="label">Tutorial sessions done (optional)</span>
              <Stepper value={d.tutorialsDone} min={0} max={100} onChange={(v) => onChange({ tutorialsDone: v })} label="Tutorial sessions" />
            </div>
          )}

          {settings.questions.some((qn) => !qn.labOnly) && (
            <div className="stack" style={{ gap: 8 }}>
              {settings.questions
                .filter((qn) => !qn.labOnly)
                .map((qn) => (
                  <YesNo
                    key={qn.key}
                    label={qn.teacher}
                    value={d.answers[qn.key]}
                    onChange={(v) => {
                      const next = { ...d.answers };
                      if (v) next[qn.key] = v;
                      else delete next[qn.key];
                      onChange({ answers: next });
                    }}
                  />
                ))}
            </div>
          )}

          {settings.tags.length > 0 && (
            <div className="field">
              <span className="label">Other notes (optional)</span>
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
            <button className="link-btn small" style={{ alignSelf: 'flex-start', color: 'var(--err)' }} onClick={onRemove}>
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
  teachers,
  teacherDept,
  classes,
  settings,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  teachers: PublicTeacher[];
  teacherDept: string;
  classes: string[];
  settings: Settings;
  onAdd: (d: Draft) => void;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ code: '', name: '', yearOfStudy: 0, batch: '', crhr: '', studentDept: '', section: '' });
  const tName = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);

  useEffect(() => {
    if (open) {
      setQ('');
      setCreating(false);
      setNc({ code: '', name: '', yearOfStudy: 0, batch: '', crhr: '', studentDept: teacherDept, section: '' });
    }
  }, [open, teacherDept]);

  const term = q.trim().toLowerCase();
  const list = courses
    .filter((c) => all || term || !teacherDept || c.department === teacherDept)
    .filter((c) => !term || `${c.code} ${c.name} ${classLabel(c)} ${c.teacher_ids.map((id) => tName.get(id)).join(' ')}`.toLowerCase().includes(term));

  const canCreate = nc.name.trim() && nc.yearOfStudy;

  return (
    <Modal open={open} onClose={onClose} title={creating ? 'Other course' : 'Add a course'}>
      {!creating ? (
        <div className="stack">
          <input className="input" placeholder="Type course name or code…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {teacherDept && !term && (
            <Seg
              options={[
                { value: false, label: `${teacherDept} courses` },
                { value: true, label: 'All' },
              ]}
              value={all}
              onChange={setAll}
            />
          )}
          <div className="stack" style={{ gap: 8, maxHeight: '45vh', overflow: 'auto' }}>
            {list.map((c) => (
              <button key={c.id} className="list-btn" onClick={() => onAdd(draftFromCourse(c, settings))}>
                <span className="grow">
                  <span className="bold">{c.name}</span>
                  {c.code && <span className="muted"> · {c.code}</span>}
                  <br />
                  <span className="small muted">
                    {subFor(c)}
                    {c.teacher_ids.length ? ` · ${c.teacher_ids.map((id) => tName.get(id)).filter(Boolean).join(', ')}` : ''}
                  </span>
                </span>
                <span className="pill">Add</span>
              </button>
            ))}
            {!list.length && <div className="small muted">No course matches “{q}”.</div>}
          </div>
          <button
            className="list-btn"
            style={{ borderStyle: 'dashed' }}
            onClick={() => {
              setCreating(true);
              setNc((n) => ({ ...n, name: q.trim() }));
            }}
          >
            <span className="avatar">＋</span>
            <span className="grow">
              <span className="bold">Other course</span>
              <br />
              <span className="small muted">{q.trim() ? `Add “${q.trim()}”` : 'Not in the list? Type it'}</span>
            </span>
          </button>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="label">Course name</span>
            <input className="input" value={nc.name} placeholder="e.g. Database Systems" onChange={(e) => setNc({ ...nc, name: e.target.value })} autoFocus />
          </label>
          <div className="field">
            <span className="label">Which students take it?</span>
            <ChoiceChips options={classes.map((c) => ({ value: c, label: c }))} value={nc.studentDept || null} onChange={(v) => setNc({ ...nc, studentDept: v })} />
          </div>
          <div className="field">
            <span className="label">Year of study</span>
            <ChoiceChips
              options={settings.years.map((y) => ({ value: y, label: `Year ${y}` }))}
              value={nc.yearOfStudy || null}
              onChange={(v) => setNc({ ...nc, yearOfStudy: v })}
            />
          </div>
          <div className="grid-3">
            <label className="field">
              <span className="label">Section (optional)</span>
              <input className="input" value={nc.section} placeholder="e.g. Sec 1" onChange={(e) => setNc({ ...nc, section: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Code (optional)</span>
              <input className="input" value={nc.code} placeholder="e.g. SEng3041" onChange={(e) => setNc({ ...nc, code: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Credit hours (optional)</span>
              <input className="input" inputMode="decimal" value={nc.crhr} onChange={(e) => setNc({ ...nc, crhr: e.target.value })} />
            </label>
          </div>
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
                    studentDept: nc.studentDept,
                    section: nc.section.trim(),
                  },
                  code: nc.code.trim(),
                  name: nc.name.trim(),
                  sub: subFor({
                    department: teacherDept,
                    student_dept: nc.studentDept,
                    section: nc.section.trim(),
                    year_of_study: nc.yearOfStudy,
                    batch: '',
                  }),
                  facts: [],
                  labKnown: false,
                  labSections: 1,
                  hasTutorial: false,
                  totalChapters: null,
                  chaptersCovered: null,
                  hasLab: null,
                  totalLabSessions: null,
                  labsCovered: null,
                  labsBySection: [null],
                  tutorialsDone: null,
                  answers: {},
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
