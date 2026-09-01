import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterCourses } from "./course-search.ts";
import type { ScoringCourse } from "./course-catalog.ts";

type SourceCourse = { cr_id: number; cr_name: string; cr_par_out_per_hole: string; cr_par_in_per_hole: string };
type SourceData = { data: { courses: SourceCourse[] } };

const source = JSON.parse(readFileSync(new URL("../data/chs_courses.json", import.meta.url), "utf8")) as SourceData;
const isValidParString = (value: string) => value.split(",").length === 9 && value.split(",").every((part) => { const par = Number(part.trim()); return Number.isInteger(par) && par >= 3 && par <= 6; });
const courses: ScoringCourse[] = source.data.courses.map((course) => ({ id: course.cr_id, name: course.cr_name.trim(), pars: isValidParString(course.cr_par_out_per_hole) && isValidParString(course.cr_par_in_per_hole) ? Array(18).fill(4) : null }));

test("course search does not truncate the local dataset or later alphabetical results", () => {
  const validCourseCount = courses.filter((course) => course.pars).length;
  const allResults = filterCourses(courses, "");
  const taiheiyo = filterCourses(courses, "taiheiyo");

  assert.equal(source.data.courses.length, 167, "all source course records are loaded");
  assert.equal(validCourseCount, 161, "all scoring-ready records have valid 18-hole pars");
  assert.equal(allResults.length, 167, "an empty search returns every course record without a cap");
  assert.equal(taiheiyo.length, 1, "a course later than Bintan remains searchable");
  assert.equal(taiheiyo[0].name, "Taiheiyo Club Gotemba Course");
});
