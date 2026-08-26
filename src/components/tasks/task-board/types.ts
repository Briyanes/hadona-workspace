/** Shared types for the TaskBoard module. */

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  division: string | null;
  due_date: string | null;
  client?: { name: string };
  task_assignees?: { user_id: string; user: { full_name: string; avatar_url: string | null } }[];
}

export interface Client {
  id: string;
  name: string;
}

export interface TaskBoardProps {
  /** Filter tasks to specific division. null = show all */
  division?: string | null;
  /** Page title shown in header */
  pageTitle?: string;
  /** Page subtitle */
  pageSubtitle?: string;
  /** Default division value for new tasks created from this board */
  defaultDivision?: string;
}

/** Create-task form shape (controlled by TaskBoard orchestrator). */
export interface TaskForm {
  title: string;
  description: string;
  client_id: string;
  priority: string;
  due_date: string;
  status: string;
  division: string;
  result: string;
  blocker: string;
  start_date: string;
}