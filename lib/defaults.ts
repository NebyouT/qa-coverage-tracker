import type { Question, Settings } from './types';

/** Defaults copied from the Settings sheet of QA_Course_Coverage_Report.xlsx. All editable in Admin → Settings. */
export const DEFAULT_QUESTIONS: Question[] = [
  { key: 'quiz', teacher: 'Have you given a quiz?', student: 'Have you taken a quiz?' },
  { key: 'assignment', teacher: 'Have you given an assignment?', student: 'Have you been given an assignment?' },
  { key: 'midexam', teacher: 'Has the mid-exam been given?', student: 'Have you taken the mid-exam?' },
  { key: 'lab', teacher: 'Has lab class started?', student: 'Have you had lab classes?', labOnly: true },
];

/** Old quick-note chips that are now proper yes/no questions; hidden if still in saved settings. */
export const RETIRED_TAGS = ['quiz given', 'assignment given', 'mid-exam done', 'lab not started'];

export const DEFAULT_SETTINGS: Settings = {
  questions: DEFAULT_QUESTIONS,
  schoolName: 'School of Computing',
  departments: [
    { code: 'IT', name: 'Information Technology' },
    { code: 'CS', name: 'Computer Science' },
    { code: 'SE', name: 'Software Engineering' },
  ],
  years: [1, 2, 3, 4, 5],
  semesters: ['Semester I', 'Semester II'],
  reportTypes: ['Mid-term', 'Final'],
  lectureWeight: 0.7,
  midBands: [
    { name: 'Bad – Immediate Action Needed', from: 0 },
    { name: 'Very Slow – Close Follow-up Needed', from: 0.2 },
    { name: 'Slightly Slow', from: 0.3 },
    { name: 'Needs Improvement', from: 0.4 },
    { name: 'Good – Recommended', from: 0.5 },
    { name: 'Average', from: 0.6 },
    { name: 'Excellent', from: 0.7 },
  ],
  finalBands: [
    { name: 'Bad – Immediate Action Needed', from: 0 },
    { name: 'Very Slow – Close Follow-up Needed', from: 0.4 },
    { name: 'Slightly Slow', from: 0.6 },
    { name: 'Needs Improvement', from: 0.75 },
    { name: 'Average', from: 0.85 },
    { name: 'Good – Recommended', from: 0.95 },
  ],
  period: { academicYear: '2019 E.C.', semester: 'Semester I', reportType: 'Mid-term' },
  tags: ['Make-up class needed', 'Using LMS', 'Class missed (holiday/other)', 'Behind schedule'],
  gapThreshold: 2,
  weeksPerSemester: 16,
  labGapThreshold: 3,
  teachersOpen: true,
  studentsOpen: true,
};

export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(stored ?? {}) } as Settings;
  s.period = { ...DEFAULT_SETTINGS.period, ...(stored?.period ?? {}) };
  if (!Array.isArray(s.questions)) s.questions = DEFAULT_QUESTIONS;
  s.tags = (s.tags ?? []).filter((t) => !RETIRED_TAGS.includes(t.trim().toLowerCase()));
  return s;
}
