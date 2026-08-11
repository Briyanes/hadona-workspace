"use client";

import { TaskBoard } from "@/components/tasks/task-board";

export default function CreativeTasksPage() {
  return (
    <TaskBoard
      division="Creative Director"
      pageTitle="Creative Tasks"
      pageSubtitle="Task khusus divisi Creative Director & Content Creator"
      defaultDivision="Creative Director"
    />
  );
}