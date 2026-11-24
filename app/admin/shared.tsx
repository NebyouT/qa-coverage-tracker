'use client';

import { createContext, useContext } from 'react';
import type { Flag, Row } from '@/lib/consolidate';
import type { Course, Period, Settings, StudentReport, Teacher, TeacherReport } from '@/lib/types';

export type AdminData = {
  settings: Settings;
  period: Period;
  teachers: Teacher[];
  courses: Course[];
  teacherReports: TeacherReport[];
  studentReports: StudentReport[];
  periods: Period[];
};

export type TabId = 'overview' | 'report' | 'duplicates' | 'tsubs' | 'ssubs' | 'teachers' | 'courses' | 'export' | 'settings';
export type ReportFilter = { teacherId?: number; dept?: string; view?: string };

export type Ctx = {
  data: AdminData;
  rows: Row[];
  reload: () => Promise<void>;
  act: <T = any>(body: Record<string, unknown>) => Promise<T>;
  goto: (tab: TabId, filter?: ReportFilter) => void;
  filter: ReportFilter;
  toast: (msg: string) => void;
};

export const AdminCtx = createContext<Ctx | null>(null);
export const useAdmin = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error('AdminCtx missing');
  return c;
};

export function FlagBadges({ flags, max = 3 }: { flags: Flag[]; max?: number }) {
  if (!flags.length) return <span className="badge ok">OK</span>;
  const shown = flags.slice(0, max);
  return (
    <span className="row" style={{ gap: 4 }}>
      {shown.map((f, i) => (
        <span key={i} className={`badge ${f.level}`}>
          {f.label}
        </span>
      ))}
      {flags.length > max && <span className="badge neutral">+{flags.length - max}</span>}
    </span>
  );
}

export function ReviewBadge({ review }: { review: string }) {
  if (review === 'verified') return <span className="badge ok">Verified</span>;
  if (review === 'rejected') return <span className="badge error">Rejected</span>;
  return <span className="badge neutral">Pending</span>;
}

export const sameSet = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
