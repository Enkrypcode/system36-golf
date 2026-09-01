import source from "../data/chs_courses.json" with { type: "json" };

export type ScoringCourse = { id: number; name: string; pars: number[] | null };
type CourseSource = { cr_id: number; cr_name: string; cr_par_out_per_hole: string; cr_par_in_per_hole: string };
type SourceDocument = { data?: { courses?: CourseSource[] } };

function parsePars(value: string) {
  const pars = value.split(",").map((part) => Number(part.trim()));
  return pars.length === 9 && pars.every((par) => Number.isInteger(par) && par >= 3 && par <= 6) ? pars : null;
}

export function loadCourseCatalog(): ScoringCourse[] {
  const courseSource = source as SourceDocument;
  return (courseSource.data?.courses ?? []).map((course) => {
    const front = parsePars(course.cr_par_out_per_hole);
    const back = parsePars(course.cr_par_in_per_hole);
    return { id: course.cr_id, name: course.cr_name.trim(), pars: front && back ? [...front, ...back] : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
