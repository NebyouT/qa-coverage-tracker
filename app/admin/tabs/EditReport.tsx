'use client';

import { useEffect, useState } from 'react';
import { score } from '@/lib/scoring';
import type { TeacherReport } from '@/lib/types';
import { Modal, Seg, StatusBadge } from '@/components/ui';
import { useAdmin } from '../shared';

export default function EditReport({ report, onClose }: { report: TeacherReport | null; onClose: () => void }) {
  const { data, act, toast } = useAdmin();
  const [r, setR] = useState<TeacherReport | null>(report);
  const [err, setErr] = useState('');
  useEffect(() => {
    setR(report);
    setErr('');
  }, [report]);
  if (!r) return null;
  const sc = score(r, data.settings);
  const numField = (k: keyof TeacherReport, label: string) => (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input sm"
        inputMode="numeric"
        value={(r[k] as number | null) ?? ''}
        onChange={(e) => setR({ ...r, [k]: e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) })}
      />
    </label>
  );
  return (
    <Modal open={!!report} onClose={onClose} title={`Edit report · ${r.course_code}`}>
      <div className="stack">
        <div className="small muted">
          {r.teacher_name} · {r.course_name} · submitted {new Date(r.created_at).toLocaleString('en-GB')}
        </div>
        <div className="grid-3">
          {numField('total_chapters', 'Total chapters')}
          {numField('chapters_covered', 'Chapters covered')}
          {numField('crhr', 'Credit hours')}
        </div>
        <div className="between">
          <span className="label">Lab</span>
          <Seg
            options={[
              { value: false, label: 'No lab' },
              { value: true, label: 'Has lab' },
            ]}
            value={r.has_lab}
            onChange={(v) => setR({ ...r, has_lab: v })}
          />
        </div>
        {r.has_lab && (
          <div className="grid-2">
            {numField('total_lab_sessions', 'Total lab sessions')}
            {numField('labs_covered', 'Labs covered')}
          </div>
        )}
        <label className="field">
          <span className="label">Remarks</span>
          <textarea className="textarea" value={r.remarks} onChange={(e) => setR({ ...r, remarks: e.target.value })} />
        </label>
        {r.tags && <div className="small muted">Quick notes: {r.tags}</div>}
        <div className="between">
          <Seg
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'verified', label: 'Verified' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            value={r.review}
            onChange={(v) => setR({ ...r, review: v as TeacherReport['review'] })}
          />
          <StatusBadge status={sc.status} tone={sc.tone} rate={sc.rate} />
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await act({ action: 'updateTeacherReport', id: r.id, report: r });
                toast('Report saved');
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
