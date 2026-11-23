'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, deviceId, periodLabel, store } from '@/lib/client';
import type { Course, Settings } from '@/lib/types';
import { ChoiceChips, ErrorBox, Loading, NumberChips, Seg } from '@/components/ui';

type Boot = { settings: Settings; courses: Course[] };
type Profile = { name: string; department: string; yearOfStudy: number | null; semester: string };
type Answer = { chapters: number | null; labs: number | null };
type Extra = { key: string; code: string; name: string; chapters: number | null };

export default function StudentFlow() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'profile' | 'courses' | 'done'>('profile');
  const [profile, setProfile] = useState<Profile>({ name: '', department: '', yearOfStudy: null, semester: '' });
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sentCount, setSentCount] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const b = await api<Boot>('/api/public/bootstrap');
      setBoot(b);
      const saved = store.get<Profile | null>('qa.student', null);
      setProfile({
        name: saved?.name ?? '',
        department: saved?.department && b.settings.departments.some((d) => d.code === saved.department) ? saved.department : '',
        yearOfStudy: saved?.yearOfStudy && b.settings.years.includes(saved.yearOfStudy) ? saved.yearOfStudy : null,
        semester: b.settings.period.semester,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = boot?.settings;
  const periodKey = s ? `${s.period.academicYear}|${profile.semester}|${s.period.reportType}` : '';
  const prevSubmit = useMemo(() => (periodKey ? store.get<Record<string, string>>('qa.studentSent', {})[periodKey] : undefined), [periodKey, step]);

  const courses = useMemo(
    () =>
      (boot?.courses ?? []).filter(
        (c) => c.department === profile.department && c.year_of_study === profile.yearOfStudy && c.semester === profile.semester,
      ),
    [boot, profile],
  );

  const answered = courses.filter((c) => answers[c.id]?.chapters !== null && answers[c.id]?.chapters !== undefined);
  const extrasReady = extras.filter((e) => (e.code.trim() || e.name.trim()) && e.chapters !== null);
  const total = answered.length + extrasReady.length;
  const profileOk = profile.name.trim().length >= 2 && profile.department && profile.yearOfStudy && profile.semester;

  async function submit() {
    if (!s || !total) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api('/api/public/student', {
        name: profile.name,
        department: profile.department,
        yearOfStudy: profile.yearOfStudy,
        semester: profile.semester,
        comment,
        device: deviceId(),
        items: [
          ...answered.map((c) => ({ courseId: c.id, chaptersCovered: answers[c.id].chapters, labsCovered: answers[c.id].labs })),
          ...extrasReady.map((e) => ({ newCourse: { code: e.code, name: e.name }, chaptersCovered: e.chapters })),
        ],
      });
      const sent = store.get<Record<string, string>>('qa.studentSent', {});
      sent[periodKey] = new Date().toISOString();
      store.set('qa.studentSent', sent);
      setSentCount(total);
      setStep('done');
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !boot) return <Shell><ErrorBox error={error} onRetry={load} /></Shell>;
  if (!boot || !s) return <Shell><Loading /></Shell>;
  if (!s.studentsOpen) {
    return (
      <Shell period={periodLabel(s.period)}>
        <div className="alert info">Student reporting is closed at the moment.</div>
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell period={periodLabel(s.period)}>
        <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
          <div className="done-icon">✓</div>
          <h1>Thank you!</h1>
          <p className="muted">
            Your report for {sentCount} course{sentCount > 1 ? 's' : ''} was sent to the QA team.
          </p>
        </div>
        <Link href="/" className="btn block">
          Done
        </Link>
      </Shell>
    );
  }

  if (step === 'profile') {
    return (
      <Shell period={periodLabel(s.period)}>
        <div>
          <h1>About you</h1>
          <p className="muted">We remember this on your phone for next time.</p>
        </div>
        <label className="field">
          <span className="label">Your full name</span>
          <input
            className="input"
            value={profile.name}
            maxLength={80}
            autoComplete="name"
            placeholder="e.g. Abebe Kebede"
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <div className="field">
          <span className="label">Department</span>
          <ChoiceChips
            options={s.departments.map((d) => ({ value: d.code, label: d.code }))}
            value={profile.department || null}
            onChange={(v) => setProfile({ ...profile, department: v })}
          />
        </div>
        <div className="field">
          <span className="label">Year</span>
          <ChoiceChips
            options={s.years.map((y) => ({ value: y, label: ordinal(y) }))}
            value={profile.yearOfStudy}
            onChange={(v) => setProfile({ ...profile, yearOfStudy: v })}
          />
        </div>
        <div className="field">
          <span className="label">Semester</span>
          <Seg options={s.semesters.map((x) => ({ value: x, label: x }))} value={profile.semester} onChange={(v) => setProfile({ ...profile, semester: v })} />
        </div>
        <div className="sticky-bar">
          <div className="inner">
            <button
              className="btn primary lg block"
              disabled={!profileOk}
              onClick={() => {
                store.set('qa.student', { ...profile, name: profile.name.trim() });
                setStep('courses');
                window.scrollTo({ top: 0 });
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell period={periodLabel({ ...s.period, semester: profile.semester })}>
      <div className="between">
        <div>
          <div className="bold">{profile.name}</div>
          <div className="small muted">
            {profile.department} · {ordinal(profile.yearOfStudy ?? 0)} · {profile.semester}
          </div>
        </div>
        <button className="btn sm" onClick={() => setStep('profile')}>
          Edit
        </button>
      </div>

      {prevSubmit && (
        <div className="alert warn small">
          You already sent a report from this phone on {new Date(prevSubmit).toLocaleDateString('en-GB')}. Send again only if something
          changed.
        </div>
      )}

      <div className="stack">
        <div>
          <h2>How many chapters has your class covered?</h2>
          <p className="small muted">Tap a number for each course. Skip courses you don&apos;t take.</p>
        </div>

        {!courses.length && (
          <div className="card small muted">No courses are listed for your year yet. Add them below.</div>
        )}

        {courses.map((c) => {
          const a = answers[c.id] ?? { chapters: null, labs: null };
          const set = (p: Partial<Answer>) => setAnswers((prev) => ({ ...prev, [c.id]: { ...a, ...p } }));
          const done = a.chapters !== null;
          return (
            <div key={c.id} className={`card stack${done ? ' ok' : ''}`}>
              <div className="between" style={{ flexWrap: 'nowrap' }}>
                <div className="grow">
                  <div className="bold">{c.name}</div>
                  <div className="small muted">
                    {c.code}
                    {c.total_chapters ? ` · ${c.total_chapters} chapters` : ''}
                  </div>
                </div>
                {done && (
                  <button className="link-btn small" onClick={() => set({ chapters: null, labs: null })}>
                    Clear
                  </button>
                )}
              </div>
              <div className="field">
                <span className="label">Chapters covered</span>
                <NumberChips max={Math.min(c.total_chapters ?? 12, 30)} value={a.chapters} onChange={(v) => set({ chapters: v })} />
              </div>
              {c.has_lab && (
                <div className="field">
                  <span className="label">Lab sessions done (optional)</span>
                  <NumberChips max={Math.min(c.total_lab_sessions ?? 10, 20)} value={a.labs} onChange={(v) => set({ labs: v })} />
                </div>
              )}
            </div>
          );
        })}

        {extras.map((e, i) => (
          <div key={e.key} className="card stack">
            <div className="between">
              <span className="label">Course not in the list</span>
              <button className="link-btn small" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            <div className="grid-2">
              <input
                className="input"
                placeholder="Course code"
                value={e.code}
                onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, code: ev.target.value } : x)))}
              />
              <input
                className="input"
                placeholder="Course name"
                value={e.name}
                onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
              />
            </div>
            <div className="field">
              <span className="label">Chapters covered</span>
              <NumberChips max={12} value={e.chapters} onChange={(v) => setExtras(extras.map((x, j) => (j === i ? { ...x, chapters: v } : x)))} />
            </div>
          </div>
        ))}

        <button className="btn block" onClick={() => setExtras([...extras, { key: String(Date.now()), code: '', name: '', chapters: null }])}>
          ＋ Add a course not listed
        </button>

        <label className="field">
          <span className="label">Anything the QA team should know? (optional)</span>
          <textarea className="textarea" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
      </div>

      {submitError && <div className="alert error">{submitError}</div>}

      <div className="sticky-bar">
        <div className="inner">
          <div className="grow small muted">{total ? `${total} course${total > 1 ? 's' : ''} answered` : 'Tap a number for each course'}</div>
          <button className="btn primary lg" disabled={!total || submitting} onClick={submit}>
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ordinal(n: number) {
  return ['', '1st year', '2nd year', '3rd year', '4th year', '5th year', '6th year', '7th year'][n] ?? `Year ${n}`;
}

function Shell({ children, period }: { children: React.ReactNode; period?: string }) {
  return (
    <main className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="logo">QA</span>
          <span>Student report</span>
        </Link>
        {period && <span className="pill">{period}</span>}
      </div>
      <div className="stack-lg">{children}</div>
    </main>
  );
}
