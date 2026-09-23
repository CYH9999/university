import * as React from "react";
import { useSearchParams } from "react-router";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useSettings } from "@/app/settings";
import type { Subject, Project, Semester } from "@/core/model/types";

export function useSemesters() {
  const s = useServices();
  return useQ(["semesters"], () => s.semesters.list());
}

/** The semester the UI is filtered by: the user's selection, else the current semester. */
export function useActiveSemester(): { semester: Semester | null; semesters: Semester[]; loading: boolean } {
  const { data: semesters = [], isLoading } = useSemesters();
  const selected = useSettings((st) => st.settings.selectedSemesterId);
  const semester = React.useMemo(
    () => semesters.find((x) => x.id === selected) ?? semesters.find((x) => x.isCurrent) ?? semesters.find((x) => x.status === "active") ?? null,
    [semesters, selected],
  );
  return { semester, semesters, loading: isLoading };
}

export function useAllSubjects() {
  const s = useServices();
  return useQ(["subjects", "all"], () => s.subjects.list({ all: true, includeArchived: true }));
}

export function useSubjectMap(): Map<string, Subject> {
  const { data = [] } = useAllSubjects();
  return React.useMemo(() => new Map(data.map((x) => [x.id, x])), [data]);
}

export function useSemesterSubjects() {
  const s = useServices();
  const { semester } = useActiveSemester();
  return useQ(["subjects", "semester", semester?.id ?? null], () => (semester ? s.subjects.list({ semesterId: semester.id }) : s.subjects.list({ all: true })));
}

export function useAllProjects() {
  const s = useServices();
  return useQ(["projects", "all"], () => s.projects.list({ includeArchived: true }));
}

export function useProjectMap(): Map<string, Project> {
  const { data = [] } = useAllProjects();
  return React.useMemo(() => new Map(data.map((x) => [x.id, x])), [data]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Re-renders every `ms` (for clocks and countdowns). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useSearchParam(name: string): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name);
  const set = React.useCallback(
    (v: string | null) => {
      setParams((p) => {
        const n = new URLSearchParams(p);
        if (v === null || v === "") n.delete(name);
        else n.set(name, v);
        return n;
      }, { replace: true });
    },
    [name, setParams],
  );
  return [value, set];
}

/**
 * Opens a "create" UI when the page is reached with ?new=1 (used by quick actions and
 * keyboard shortcuts), then removes the parameter. Extra params are passed as defaults.
 */
export function useNewParam(onNew: (params: URLSearchParams) => void) {
  const [params, setParams] = useSearchParams();
  const ref = React.useRef(onNew);
  ref.current = onNew;
  React.useEffect(() => {
    if (params.get("new") === "1") {
      const copy = new URLSearchParams(params);
      ref.current(copy);
      const n = new URLSearchParams(params);
      n.delete("new");
      setParams(n, { replace: true });
    }
  }, [params, setParams]);
}

/** Opens an entity when the page is reached with ?open=<id>. */
export function useOpenParam(onOpen: (id: string) => void) {
  const [params, setParams] = useSearchParams();
  const ref = React.useRef(onOpen);
  ref.current = onOpen;
  React.useEffect(() => {
    const id = params.get("open");
    if (id) {
      ref.current(id);
      const n = new URLSearchParams(params);
      n.delete("open");
      setParams(n, { replace: true });
    }
  }, [params, setParams]);
}
