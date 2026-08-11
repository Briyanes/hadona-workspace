"use client";

import { TaskBoard } from "@/components/tasks/task-board";

export default function SocialMediaTasksPage() {
  return (
    <TaskBoard
      division="Social Media Manager"
      pageTitle="Social Media Tasks"
      pageSubtitle="Task khusus divisi Social Media Manager"
      defaultDivision="Social Media Manager"
    />
  );
}