"use client";

import { TaskBoard } from "@/components/tasks/task-board";

export default function EditorTasksPage() {
  return (
    <TaskBoard
      division="Editor"
      pageTitle="Editor Tasks"
      pageSubtitle="Task khusus divisi Editor"
      defaultDivision="Editor"
    />
  );
}