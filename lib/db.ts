import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import { seedCourses } from './seed';

export type DbRow = Record<string, any>;
type QueryFn = (text: string, params?: unknown[]) => Promise<DbRow[]>;

const SCHEMA = [
  `create table if not exists settings (
     key text primary key,
     value jsonb not null
   )`,
  `create table if not exists teachers (
     id serial primary key,
     name text not null,
     department text not null default '',
     active boolean not null default true,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists courses (
     id serial primary key,
     academic_year text not null,
     semester text not null,
     department text not null,
     year_of_study int not null,
     batch text not null default '',
     code text not null,
     name text not null,
     crhr double precision,
     total_chapters int,
     has_lab boolean not null default false,
     total_lab_sessions int,
     source text not null default 'admin',
     created_at timestamptz not null default now()
   )`,
  `create table if not exists teacher_courses (
     teacher_id int not null references teachers(id) on delete cascade,
     course_id int not null references courses(id) on delete cascade,
     primary key (teacher_id, course_id)
   )`,
  `create table if not exists teacher_reports (
     id serial primary key,
     created_at timestamptz not null default now(),
     academic_year text not null,
     semester text not null,
     report_type text not null,
     teacher_id int references teachers(id) on delete set null,
     teacher_name text not null default '',
     course_id int references courses(id) on delete set null,
     department text not null default '',
     year_of_study int,
     batch text not null default '',
     course_code text not null default '',
     course_name text not null default '',
     crhr double precision,
     total_chapters int,
     chapters_covered int,
     has_lab boolean not null default false,
     total_lab_sessions int,
     labs_covered int,
     tags text not null default '',
     remarks text not null default '',
     review text not null default 'pending',
     device text not null default ''
   )`,
  `create table if not exists student_reports (
     id serial primary key,
     created_at timestamptz not null default now(),
     submission text not null default '',
     academic_year text not null,
     semester text not null,
     report_type text not null,
     student_name text not null,
     department text not null default '',
     year_of_study int,
     course_id int references courses(id) on delete set null,
     course_code text not null default '',
     course_name text not null default '',
     chapters_covered int,
     labs_covered int,
     comment text not null default '',
     review text not null default 'pending',
     device text not null default ''
   )`,
  `create index if not exists teacher_reports_period on teacher_reports (academic_year, semester, report_type)`,
  `create index if not exists student_reports_period on student_reports (academic_year, semester, report_type)`,
  `create index if not exists courses_period on courses (academic_year, semester)`,
];

type Step = string | ((q: QueryFn) => Promise<unknown>);

/** Each entry upgrades the database by one version. Never edit an old entry; add a new one. */
const MIGRATIONS: Step[][] = [
  SCHEMA,
  // v2: course offering details, lab sections, self-registered teachers
  [
    `alter table courses
       add column if not exists student_dept text not null default '',
       add column if not exists section text not null default '',
       add column if not exists students int,
       add column if not exists lec_hours double precision,
       add column if not exists lab_hours double precision,
       add column if not exists tut_hours double precision,
       add column if not exists lec_sections int,
       add column if not exists lab_sections int,
       add column if not exists tut_sections int,
       add column if not exists curriculum_semester text not null default ''`,
    `alter table teachers add column if not exists source text not null default 'admin'`,
    `alter table teacher_reports
       add column if not exists student_dept text not null default '',
       add column if not exists section text not null default '',
       add column if not exists labs_by_section text not null default '',
       add column if not exists tutorials_done int`,
    `alter table teacher_reports alter column labs_covered type double precision`,
  ],
  // v3: yes/no answers (quiz, assignment, mid-exam, lab class) and the built-in course list
  [
    `alter table teacher_reports add column if not exists answers text not null default ''`,
    `alter table student_reports add column if not exists answers text not null default ''`,
    (q) => seedCourses(q),
  ],
];

const g = globalThis as unknown as { __qaDb?: Promise<QueryFn> };

async function connect(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let q: QueryFn;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    q = (text, params = []) => sql.query(text, params as any[]) as unknown as Promise<DbRow[]>;
  } else {
    if (process.env.VERCEL) {
      throw new Error('DATABASE_URL is not set. In Vercel open Storage → connect a Neon Postgres database, then redeploy.');
    }
    // Local development: an embedded Postgres stored in ./.data (no install needed).
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = path.join(process.cwd(), '.data');
    fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(path.join(dir, 'pglite'));
    q = async (text, params = []) => (await db.query<DbRow>(text, params as any[])).rows;
  }
  // Cold start: find the schema version and apply only the missing migrations.
  const [{ t }] = await q(`select to_regclass('public.settings') as t`);
  let version = 0;
  if (t) {
    const r = await q(`select value from settings where key = 'schema'`);
    version = r[0] ? Number(r[0].value) : 1;
  }
  if (version < MIGRATIONS.length) {
    for (let i = version; i < MIGRATIONS.length; i++) {
      for (const step of MIGRATIONS[i]) await (typeof step === 'string' ? q(step) : step(q));
    }
    await q(
      `insert into settings (key, value) values ('schema', $1::jsonb) on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(MIGRATIONS.length)],
    );
  }
  return q;
}

export async function query<T = DbRow>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!g.__qaDb) {
    g.__qaDb = connect().catch((e) => {
      g.__qaDb = undefined;
      throw e;
    });
  }
  const q = await g.__qaDb;
  return (await q(text, params)) as T[];
}
