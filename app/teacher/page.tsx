import type { Metadata } from 'next';
import TeacherFlow from './TeacherFlow';

export const metadata: Metadata = { title: 'Teacher report · Course Coverage' };

export default function Page() {
  return <TeacherFlow />;
}
