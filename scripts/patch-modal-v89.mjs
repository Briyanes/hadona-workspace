import { readFileSync, writeFileSync } from "fs";

const file = "src/components/content-plans/plan-detail-modal.tsx";
let src = readFileSync(file, "utf8");
const applied = [];

function rep(label, from, to, optional = false) {
  if (!src.includes(from)) {
    if (optional) { console.log(`SKIP (not found): ${label}`); return; }
    console.error(`FAIL: ${label}`); process.exit(1);
  }
  src = src.replace(from, to);
  applied.push(label);
  console.log(`OK: ${label}`);
}

// 1. Progress options: tambah Draft
rep(
  "PROGRESS_OPTIONS + Draft",
  'const PROGRESS_OPTIONS = ["Done", "Proses Edit", "Cancel"];',
  'const PROGRESS_OPTIONS = ["Draft", "Proses Edit", "Done", "Cancel"];'
);

// 2. progressColors: tambah draft
rep(
  "progressColors + draft",
  `const progressColors: Record<string, string> = {
  done: "bg-success/20 text-success",`,
  `const progressColors: Record<string, string> = {
  draft: "bg-muted/20 text-muted",
  done: "bg-success/20 text-success",`
);

// 3. progressLabels + getProgressKey normalize
rep(
  "progressLabels + getProgressKey",
  `const progressLabels: Record<string, string> = {
  done: "Done",
  proses_edit: "Proses Edit",
  cancel: "Cancel",
};

function getProgressKey(value: string | null): string {
  if (!value) return "proses_edit";
  return value.toLowerCase().replace(/\\s+/g, "_");
}`,
  `const progressLabels: Record<string, string> = {
  draft: "Draft",
  done: "Done",
  proses_edit: "Proses Edit",
  cancel: "Cancel",
};

function getProgressKey(value: string | null): string {
  if (!value) return "draft";
  const lower = value.toLowerCase().trim().replace(/\\s+/g, "_");
  if (["done", "selesai", "wrapped", "terpublish", "published"].includes(lower)) return "done";
  if (["cancel", "cancelled", "canceled", "dibatalkan"].includes(lower)) return "cancel";
  if (["proses_edit", "editing", "on_edit"].includes(lower)) return "proses_edit";
  if (["draft", "idea", "planning", "rencana"].includes(lower)) return "draft";
  return lower;
}`
);

// 4. Interface: tambah task_id
rep(
  "interface task_id",
  `  tanggal_upload: string | null;
  progress: string | null;
}`,
  `  tanggal_upload: string | null;
  progress: string | null;
  /** Task editor ter-link (dibuat otomatis saat progress → Proses Edit) */
  task_id: string | null;
}`
);

// 5. editForm default progress Draft
rep(
  "editForm default Draft",
  `progress: plan.progress || "Proses Edit",`,
  `progress: plan.progress || "Draft",`
);

// 6. handleSaveEdit: normalize progress + task sync trigger
rep(
  "handleSaveEdit normalize + task sync",
  `          tanggal_upload: editForm.tanggal_upload || null,
          progress: editForm.progress,
        } as never)
        .eq("id", plan.id);

      if (error) throw error;

      toast.success("Content plan diupdate!");
      setIsEditing(false);
      onUpdated();`,
  `          tanggal_upload: editForm.tanggal_upload || null,
          progress: getProgressKey(editForm.progress),
        } as never)
        .eq("id", plan.id);

      if (error) throw error;

      // Workflow trigger: Proses Edit = buat task editor; Done = selesaikan task
      const newKey = getProgressKey(editForm.progress);
      if (newKey === "proses_edit" && !plan.task_id) {
        const { data: userData } = await supabase.auth.getUser();
        const descParts: string[] = [];
        if (plan.pilar) descParts.push(\`Pilar: \${plan.pilar}\`);
        if (plan.konten) descParts.push(\`Konten: \${plan.konten}\`);
        if (plan.tema) descParts.push(\`Tema: \${plan.tema}\`);
        if (editForm.details) descParts.push("", "Details:", editForm.details);
        if (editForm.reference) descParts.push("", \`Reference: \${editForm.reference}\`);
        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .insert({
            title: \`[Content] \${plan.client?.name || "Client"} — \${plan.tema || editForm.konten || "Content Plan"}\`,
            description: descParts.join("\\n") || null,
            client_id: plan.client_id || null,
            priority: "medium",
            status: "todo",
            division: "Content Production",
            due_date: editForm.tanggal_upload || null,
            created_by: userData.user?.id,
          } as never)
          .select("id")
          .single();
        if (!taskError) {
          const taskId = (task as unknown as { id?: string } | null)?.id;
          if (taskId) {
            await supabase.from("content_plans").update({ task_id: taskId } as never).eq("id", plan.id);
            toast.success("Task editor dibuat di Task Manager (Content Production)");
          }
        }
      } else if (newKey === "done" && plan.task_id) {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ status: "done" } as never)
          .eq("id", plan.task_id);
        if (!taskError) toast.success("Task editor ditandai selesai");
      }

      toast.success("Content plan diupdate!");
      setIsEditing(false);
      onUpdated();`
);

writeFileSync(file, src);
console.log(`\n${applied.length} patch applied.`);