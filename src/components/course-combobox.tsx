"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { ScoringCourse } from "@/lib/course-catalog";
import { filterCourses } from "@/lib/course-search";

export function CourseCombobox({ courses, selectedCourse, onSelect }: { courses: ScoringCourse[]; selectedCourse?: ScoringCourse; onSelect: (course: ScoringCourse) => void }) {
  const [query, setQuery] = useState(selectedCourse?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const results = useMemo(() => filterCourses(courses, query), [courses, query]);
  const selectCourse = (course: ScoringCourse) => { setQuery(course.name); setOpen(false); setActiveIndex(0); onSelect(course); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1))); }
    if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); if (results[activeIndex]) selectCourse(results[activeIndex]); }
    if (event.key === "Escape") { setOpen(false); setQuery(selectedCourse?.name ?? ""); }
  };
  return <div className="course-combobox">
    <input role="combobox" aria-autocomplete="list" aria-controls={resultsId} aria-expanded={open} value={query} placeholder="Search a golf course" onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }} onBlur={() => { blurTimer.current = setTimeout(() => { setOpen(false); setQuery(selectedCourse?.name ?? ""); }, 120); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }} onKeyDown={onKeyDown} />
    {open && <div className="course-results" id={resultsId} role="listbox">{results.length ? results.map((course, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={course.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCourse(course)}><span>{course.name}</span><small>{course.pars ? `Par ${course.pars.reduce((total, par) => total + par, 0)}` : "Unavailable"}</small></button>) : <p>No matching courses</p>}</div>}
  </div>;
}
