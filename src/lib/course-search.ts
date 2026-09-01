import type { ScoringCourse } from "@/lib/course-catalog";

export function filterCourses(courses: ScoringCourse[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return courses.filter((course) => course.name.toLowerCase().includes(normalizedQuery));
}
