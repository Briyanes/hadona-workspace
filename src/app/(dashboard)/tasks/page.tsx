"use client";

import { TaskBoard } from "@/components/tasks/task-board";

export default function TasksPage() {
  return (
    <TaskBoard
      division={null}
      pageTitle="All Tasks"
      pageSubtitle="Drag & drop untuk memindahkan tugas • Klik kartu untuk detail"
    />
  );
}