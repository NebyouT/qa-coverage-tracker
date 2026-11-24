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
   - *Courses tab* → **Import Excel**. The file type is detected automatically:
     - **Course offering** (e.g. `SE - 2019 E.C SEM - I Course Offering.xlsx`): adds the lecturers, the courses with their
       class/section (`IE [Sec 1]` → class IE, Sec 1), number of students, credit hours, lecture/lab/tutorial hours and
       sections, and who teaches what. Year and semester come from the title row. Re-importing updates instead of duplicating.
     - **QA report workbook** (`QA_Course_Coverage_Report.xlsx`): adds courses and, if ticked, their progress.
   - Or **Paste list** from Excel, or add courses one by one. Teachers can also add their own name and courses ("Other").
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

**Export (Admin → Export):** the default file is the QA team's `QA_Course_Coverage_Report.xlsx`, filled in place:
same 5 sheets, columns A–X, formulas, drop-downs, colours and charts (template in `templates/`, embedded by
`node scripts/embed-template.mjs`). One row per course from row 6. Formula columns keep their formulas and also carry the
computed result, so a system that reads values without recalculating gets correct numbers. The Export tab checks first
that every row has a course code and batch (the workbook's Data Check needs them) and lets you fill them in place.
A separate **Detailed workbook** holds every submission, student agreement and answers for the QA team (not for import).

**First report is kept:** when a course is reported again, the new report is stored next to the first one and never
replaces it. The report and export use the one you choose (*Use this one*), otherwise the first one sent.
*Duplicates* lists every entry added more than once: same course reported again, same student name reporting the
same course again, the same course listed twice, and same or similar teacher names.

**Student check:** each student's report is compared with the teacher's (chapters within 1, lab sessions of the
student's own lab section within 2, same yes/no answers). The course report shows "N of M students agree" and, per
student, what differs.

**Built-in course list:** `lib/seed.ts` holds the 2019 E.C. Semester I list (22 SE courses with their lecturers from the
course offering, plus 13 IT courses from the QA workbook). It is loaded automatically into a new or upgraded database, so
the teacher and student pages are never empty. *Courses → Load built-in list* adds anything missing again. To change the
list, edit `lib/seed.ts` or use the Courses tab.

**Yes / No questions:** teachers and students answer the same questions for every course: quiz, assignment, mid-exam,
and lab class (lab courses only). The course report shows the teacher's answer next to the students' count and flags
it when most students disagree. Wording and questions are editable in *Settings*.

**Labs and tutorials (from the course offering):** a course with lab hours is a lab course, so the teacher is not asked.
"Lab sessions planned" starts at the number of teaching weeks (16, in *Settings*). When a course has several lab sections,
the teacher taps sessions done per section; the lab % uses their average and sections far apart are flagged. Courses
with tutorial hours get an optional "tutorial sessions done" question (shown in the report, not in the score).

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
