# QA Course Coverage Tracker

A small web app that replaces passing the Excel workbook around. Teachers and students get a link,
tap a few numbers, and the QA team sees one consolidated report, with the same formulas and status
bands as `QA_Course_Coverage_Report.xlsx`, and exports it back to Excel.

| Link | Who | What they do |
|---|---|---|
| `/teacher` | Teachers | Tap their name → their courses → tap chapters/labs covered → Submit |
| `/student` | Students | Name, department, year, semester → tap chapters covered per course → Submit |
| `/admin` | QA team (password) | Review, verify, fix duplicates, manage teachers & courses, export Excel |

No login for teachers or students. Every submission is kept, and the admin decides what counts.

## How the data flows

1. **Admin sets up once per semester**
   - *Teachers tab* → paste the staff list (`Name, Dept` per line).
   - *Courses tab* → **Import Excel** (your QA workbook), **Paste list** from Excel, or add one by one.
     Assigning teachers to courses is optional, since teachers can add their own courses.
   - *Overview* → set the **reporting period** (e.g. `2019 E.C. · Semester I · Mid-term`) and copy the two links to Telegram.
2. **Teachers** open the link, tap their name (remembered on the phone), add their 2–3 courses once,
   then for each course tap *chapters covered* and *labs done*. Quick-note chips replace typing.
   The live result (coverage %, performance rate, status) is shown before they submit.
3. **Students** pick department/year/semester, see the courses for their class and tap how many chapters were covered.
4. **Admin reviews**
   - *Course report* = one row per course (like the `QA_Report` sheet) with checks:
     - `Duplicate`: the same course was reported more than once
     - `Students say X ch, teacher Y`: students' median differs by ≥ 2 chapters (adjustable)
     - `Incomplete` / `Lab data missing` / `No teacher report` / `New course added by teacher`
   - Click a course to **Verify / Reject / Edit / Delete** each submission. The report uses the newest
     *verified* submission, otherwise the newest one.
   - *Teachers* tab = per-teacher summary (courses, reported, average performance). Click to filter.
   - **Export Excel** → `QA_Report` (same columns as the template + Instructor, student median, flags),
     `By_Teacher`, `Summary`, `Teacher_Submissions`, `Student_Submissions`.

Performance rate = Lecture % × 70% + Lab % × 30% (lecture only when there is no lab). Weights, status bands,
departments, years and quick notes are editable in *Settings*.

## Run it on your computer

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Admin password locally is `admin`.
Data is stored in `./.data` (an embedded Postgres), with nothing to install. Delete that folder to start fresh.

## Put it online (GitHub + Vercel, free tier)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "QA coverage tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/qa-coverage-tracker.git
   git push -u origin main
   ```
2. **Import in Vercel**: vercel.com → *Add New… → Project* → pick the repo → *Deploy* (no settings needed).
3. **Add the database**: in the project, open *Storage → Create Database → Neon (Postgres)* → connect it to the project.
   This sets `DATABASE_URL` automatically. Tables are created on first use.
4. **Set the admin password**: *Settings → Environment Variables* → add `ADMIN_PASSWORD` = your password.
5. *Deployments → … → Redeploy*. Open `https://<your-app>.vercel.app/admin`.

## Project layout

```
app/
  page.tsx               landing page (teacher / student)
  teacher/TeacherFlow.tsx teacher reporting UI
  student/StudentFlow.tsx student reporting UI
  admin/                 dashboard (tabs/*.tsx)
  api/public/*           bootstrap, teacher submit, student submit (no auth)
  api/admin/*            admin data & actions, Excel import/export, login
lib/
  scoring.ts             coverage %, performance rate, status (same rules as Excel)
  consolidate.ts         one row per course, duplicate & student-gap checks, summaries
  normalize.ts           fixes "semester ll", "2019E.C", code spacing, etc.
  db.ts / repo.ts        Postgres (Neon in production, PGlite locally)
  defaults.ts            default settings copied from the workbook's Settings sheet
```

## Notes

- Teacher and student links are open by design. Turn them off in *Overview* (“Teachers can report” /
  “Students can report”) between reporting rounds.
- Students' answers never overwrite teacher numbers. They are only used to flag gaps.
- The phone remembers the teacher's name and the student's class (localStorage), so a repeat report is 2–3 taps.
