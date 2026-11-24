'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, periodLabel } from '@/lib/client';
import { consolidate, findDuplicates, needsAttention } from '@/lib/consolidate';
import type { Period } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/ui';
import { AdminCtx, type AdminData, type ReportFilter, type TabId } from './shared';
import Overview from './tabs/Overview';
import CourseReport from './tabs/CourseReport';
import TeacherSubmissions from './tabs/TeacherSubmissions';
import StudentSubmissions from './tabs/StudentSubmissions';
import Teachers from './tabs/Teachers';
import Courses from './tabs/Courses';
import SettingsTab from './tabs/SettingsTab';
import Duplicates from './tabs/Duplicates';
import ExportTab from './tabs/ExportTab';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'report', label: 'Course report' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'tsubs', label: 'Teacher submissions' },
  { id: 'ssubs', label: 'Student submissions' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'courses', label: 'Courses' },
  { id: 'export', label: 'Export' },
  { id: 'settings', label: 'Settings' },
];

const pkey = (p: Period) => `${p.academicYear}|${p.semester}|${p.reportType}`;

export default function AdminApp() {
  const [data, setData] = useState<AdminData | null>(null);
  const [view, setView] = useState<Period | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const [filter, setFilter] = useState<ReportFilter>({});
  const [toastMsg, setToastMsg] = useState('');

  const load = useCallback(async (p?: Period | null) => {
    setError('');
    try {
      const q = p ? `?ay=${encodeURIComponent(p.academicYear)}&sem=${encodeURIComponent(p.semester)}&rt=${encodeURIComponent(p.reportType)}` : '';
      const d = await api<AdminData>(`/api/admin${q}`);
      setData(d);
      setView(d.period);
    } catch (e) {
      const msg = (e as Error).message;
      if (/sign in/i.test(msg)) window.location.reload();
      setError(msg);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      data
        ? consolidate({
            period: data.period,
            settings: data.settings,
            courses: data.courses,
            teachers: data.teachers,
            teacherReports: data.teacherReports,
            studentReports: data.studentReports,
          })
        : [],
    [data],
  );

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(''), 2600);
  }, []);

  const ctx = useMemo(
    () =>
      data
        ? {
            data,
            rows,
            filter,
            toast,
            reload: () => load(view),
            act: async <T,>(body: Record<string, unknown>) => {
              const r = await api<T>('/api/admin', body);
              await load(view);
              return r;
            },
            goto: (t: TabId, f?: ReportFilter) => {
              setFilter(f ?? {});
              setTab(t);
              window.scrollTo({ top: 0 });
            },
          }
        : null,
    [data, rows, filter, toast, load, view],
  );

  if (error && !data) return <main className="wrap-wide"><ErrorBox error={error} onRetry={() => load(view)} /></main>;
  if (!data || !ctx) return <main className="wrap-wide"><Loading /></main>;

  const attention = rows.filter(needsAttention).length;
  const dups = findDuplicates({
    period: data.period,
    courses: data.courses,
    teachers: data.teachers,
    teacherReports: data.teacherReports,
    studentReports: data.studentReports,
  });
  const dupCount =
    dups.teacherReports.filter((g) => g.open > 1).length +
    dups.studentReports.filter((g) => g.open > 1).length +
    dups.courses.length +
    dups.teachers.filter((g) => g.entries.filter((t) => t.active).length > 1).length;
  const pendingT = data.teacherReports.filter((r) => r.review === 'pending').length;
  const pendingS = new Set(data.studentReports.filter((r) => r.review === 'pending').map((r) => r.submission)).size;
  const isActive = pkey(data.period) === pkey(data.settings.period);

  return (
    <AdminCtx.Provider value={ctx}>
      <main className="wrap-wide">
        <div className="topbar">
          <div className="brand">
            <span className="logo">QA</span>
            <span>
              {data.settings.schoolName} · QA admin
            </span>
          </div>
          <div className="row">
            <select
              className="select sm"
              style={{ width: 'auto' }}
              value={pkey(data.period)}
              onChange={(e) => {
                const p = data.periods.find((x) => pkey(x) === e.target.value);
                if (p) load(p);
              }}
              aria-label="Period to view"
            >
              {data.periods.map((p) => (
                <option key={pkey(p)} value={pkey(p)}>
                  {periodLabel(p)}
                  {pkey(p) === pkey(data.settings.period) ? ' (active)' : ''}
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              onClick={async () => {
                await api('/api/admin/login', undefined, 'DELETE');
                window.location.reload();
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {!isActive && (
          <div className="alert warn small" style={{ marginBottom: 12 }}>
            You are viewing an older period. New reports go to {periodLabel(data.settings.period)}.
          </div>
        )}
        {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => ctx.goto(t.id)}>
              {t.label}
              {t.id === 'report' && attention > 0 && <span className="count">{attention}</span>}
              {t.id === 'duplicates' && dupCount > 0 && <span className="count">{dupCount}</span>}
              {t.id === 'tsubs' && pendingT > 0 && <span className="count" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>{pendingT}</span>}
              {t.id === 'ssubs' && pendingS > 0 && <span className="count" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>{pendingS}</span>}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <Overview />}
        {tab === 'report' && <CourseReport />}
        {tab === 'tsubs' && <TeacherSubmissions />}
        {tab === 'ssubs' && <StudentSubmissions />}
        {tab === 'teachers' && <Teachers />}
        {tab === 'courses' && <Courses />}
        {tab === 'duplicates' && <Duplicates />}
        {tab === 'export' && <ExportTab />}
        {tab === 'settings' && <SettingsTab />}

        {toastMsg && (
          <div
            className="alert ok"
            style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 60, boxShadow: 'var(--shadow)' }}
          >
            {toastMsg}
          </div>
        )}
      </main>
    </AdminCtx.Provider>
  );
}
