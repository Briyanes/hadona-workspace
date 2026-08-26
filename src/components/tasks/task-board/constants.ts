import type { TaskForm } from "./types";

/** Kanban columns — id must match tasks.status values in DB. */
export const COLUMNS = [
  { id: "todo", label: "To Do", color: "border-t-muted" },
  { id: "in_progress", label: "In Progress", color: "border-t-warning" },
  { id: "review", label: "Review", color: "border-t-accent" },
  { id: "blocked", label: "Blocked", color: "border-t-danger" },
  { id: "done", label: "Done", color: "border-t-success" },
];

export const priorityColors: Record<string, string> = {
  low: "text-muted",
  medium: "text-primary",
  high: "text-warning",
  urgent: "text-danger",
};

/** Division tab options for filter (order matches form Divisi dropdown). */
export const DIVISION_TABS = [
  { label: "All Tasks", value: null },
  { label: "Creative", value: "Creative Director" },
  { label: "Content Creator", value: "Content Creator" },
  { label: "Editor", value: "Editor" },
  { label: "Production", value: "Production" },
  { label: "Social Media", value: "Social Media Manager" },
  { label: "Project Manager", value: "Project Manager" },
  { label: "Advertiser", value: "Advertiser" },
  { label: "Account Executive", value: "Account Executive" },
  { label: "Copywriter", value: "Copywriter" },
  { label: "Developer", value: "Developer" },
];

export const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Factory for a blank create-task form. */
export function emptyTaskForm(defaultDivision = ""): TaskForm {
  return {
    title: "",
    description: "",
    client_id: "",
    priority: "medium",
    due_date: "",
    status: "todo",
    division: defaultDivision,
    result: "",
    blocker: "",
    start_date: "",
  };
}