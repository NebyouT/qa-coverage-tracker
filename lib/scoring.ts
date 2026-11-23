import type { Band, Settings } from './types';
import { num } from './normalize';

export type ScoreInput = {
  report_type: string;
  total_chapters: number | null;
  chapters_covered: number | null;
  has_lab: boolean;
  total_lab_sessions: number | null;
  labs_covered: number | null;
};

export type Score = {
  lecture: number | null;
  lab: number | null;
  rate: number | null;
  status: string;
  /** 0 (worst) .. 6 (best) colour step for the status badge */
  tone: number;
  chaptersRemaining: number | null;
  labsRemaining: number | null;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const isFinal = (reportType: string) => /^fin/i.test(reportType ?? '');

export function bandFor(rate: number, bands: Band[]): { band: Band; index: number; count: number } | null {
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  let index = -1;
  sorted.forEach((b, i) => {
    if (rate >= b.from - 1e-9) index = i;
  });
  if (index < 0) return null;
  return { band: sorted[index], index, count: sorted.length };
}

/** Same rules as the Excel template: Lecture % x weight + Lab % x (1-weight); lecture only if there is no lab. */
export function score(r: ScoreInput, s: Pick<Settings, 'lectureWeight' | 'midBands' | 'finalBands'>): Score {
  const total = num(r.total_chapters);
  const cov = num(r.chapters_covered);
  const lecture = total && total > 0 && cov !== null ? Math.min(cov / total, 1) : null;

  let lab: number | null = null;
  let labsRemaining: number | null = null;
  if (r.has_lab) {
    const tl = num(r.total_lab_sessions);
    const lc = num(r.labs_covered) ?? 0;
    if (tl && tl > 0) {
      lab = Math.min(lc / tl, 1);
      labsRemaining = Math.max(tl - lc, 0);
    }
  }

  const w = s.lectureWeight;
  const rate = lecture === null ? null : round4(lab === null ? lecture : lecture * w + lab * (1 - w));
  let status = '';
  let tone = 0;
  if (rate !== null) {
    const found = bandFor(rate, isFinal(r.report_type) ? s.finalBands : s.midBands);
    if (found) {
      status = found.band.name;
      tone = found.count > 1 ? Math.round((found.index / (found.count - 1)) * 6) : 6;
    }
  }
  return {
    lecture,
    lab,
    rate,
    status,
    tone,
    chaptersRemaining: total !== null && cov !== null ? Math.max(total - cov, 0) : null,
    labsRemaining,
  };
}

export const pct = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(digits)}%`;
