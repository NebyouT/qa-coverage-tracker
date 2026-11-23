import Link from 'next/link';

export default function Home() {
  return (
    <main className="wrap">
      <div className="stack-lg" style={{ paddingTop: 32 }}>
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="logo" style={{ width: 56, height: 56, borderRadius: 16, fontSize: '1.2rem' }}>QA</div>
          <h1>Course Coverage Reporting</h1>
          <p className="muted">Tell the QA team how far each course has gone. It takes about a minute.</p>
        </div>
        <Link href="/teacher" className="card role-card">
          <span className="icon">👩‍🏫</span>
          <span className="grow">
            <h2>I am a teacher</h2>
            <span className="muted small">Report chapters and labs covered in your courses</span>
          </span>
          <span className="faint">›</span>
        </Link>
        <Link href="/student" className="card role-card">
          <span className="icon">🎓</span>
          <span className="grow">
            <h2>I am a student</h2>
            <span className="muted small">Report how many chapters your class has covered</span>
          </span>
          <span className="faint">›</span>
        </Link>
        <p className="center small">
          <Link href="/admin" className="faint">QA admin</Link>
        </p>
      </div>
    </main>
  );
}
