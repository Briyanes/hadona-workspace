"use client";

import { TaskBoard } from "@/components/tasks/task-board";

export default function ProductionTasksPage() {
  return (
    <TaskBoard
      division="Production"
      pageTitle="Production Tasks"
      pageSubtitle="Task khusus divisi Production"
      defaultDivision="Production"
    />
  );
}