import { getSettings, listCourses, listTeachers } from '@/lib/repo';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Everything the teacher and student pages need to render: settings, teacher names, and this year's course list. */
export async function GET() {
  try {
    const settings = await getSettings();
    const [teachers, courses] = await Promise.all([listTeachers(), listCourses({ academicYear: settings.period.academicYear })]);
    return ok({
      settings,
      teachers: teachers.filter((t) => t.active).map(({ id, name, department }) => ({ id, name, department })),
      courses,
    });
  } catch (e) {
    return fail(e);
  }
}
