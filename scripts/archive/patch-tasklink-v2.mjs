import { readFileSync, writeFileSync } from "fs";

// ── File 1: page.tsx — ganti link task_id → sheet_row_id ──
const pageFile = "src/app/(dashboard)/content-plans/page.tsx";
let page = readFileSync(pageFile, "utf8");

function rep(file, src, label, from, to) {
  if (!src.includes(from)) { console.error(`FAIL [${file}]: ${label}`); process.exit(1); }
  console.log(`OK [${file}]: ${label}`);
  return src.replace(from, to);
}

// 1a. Interface ContentPlan: hapus task_id
page = rep(pageFile, page, "interface: hapus task_id",
`  tanggal_upload: string | null;
  progress: string | null;
  /** Task editor ter-link (dibuat otomatis saat progress → Proses Edit) */
  task_id: string | null;
}`,
`  tanggal_upload: string | null;
  progress: string | null;
}`);

// 1b. Caller kondisi tanpa task_id
page = rep(pageFile, page, "caller: kondisi proses_edit",
`      if (newKey === "proses_edit" && !(oldPlan && oldPlan.task_id)) {`,
`      if (newKey === "proses_edit") {`);

// 1c. Hapus prop task_id caller 1
page = rep(pageFile, page, "caller 1: hapus task_id prop",
`            tanggal_upload: payload.tanggal_upload,
            task_id: oldPlan?.task_id || null,
          },`,
`            tanggal_upload: payload.tanggal_upload,
          },`);

// 1d. Hapus prop task_id caller 2
page = rep(pageFile, page, "caller 2: hapus task_id prop",
`            tanggal_upload: oldPlan.tanggal_upload,
            task_id: oldPlan.task_id,
          },`,
`            tanggal_upload: oldPlan.tanggal_upload,
          },`);

// 1e. Rewrite syncTaskForPlan → sheet_row_id
page = rep(pageFile, page, "syncTaskForPlan → sheet_row_id",
`  async function syncTaskForPlan(
    plan: {
      id: string;
      client_id: string;
      client_name?: string;
      pilar?: string | null;
      konten?: string | null;
      tema?: string | null;
      details?: string | null;
      reference?: string | null;
      tanggal_upload?: string | null;
      task_id?: string | null;
    },
    newKey: string
  ) {
    try {
      if (newKey === "proses_edit" && plan.id && !plan.task_id) {
        const { data: userData } = await supabase.auth.getUser();
        const descParts: string[] = [];
        if (plan.pilar) descParts.push(\`Pilar: \${plan.pilar}\`);
        if (plan.konten) descParts.push(\`Konten: \${plan.konten}\`);
        if (plan.tema) descParts.push(\`Tema: \${plan.tema}\`);
        if (plan.details) descParts.push("", "Details:", plan.details);
        if (plan.reference) descParts.push("", \`Reference: \${plan.reference}\`);
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            title: \`[Content] \${plan.client_name || "Client"} — \${plan.tema || plan.konten || "Content Plan"}\`,
            description: descParts.join("\\n") || null,
            client_id: plan.client_id || null,
            priority: "medium",
            status: "todo",
            division: "Content Production",
            due_date: plan.tanggal_upload || null,
            created_by: userData.user?.id,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const taskId = (task as unknown as { id?: string } | null)?.id;
        if (taskId) {
          // Link balik ke plan (kolom task_id — migration v89)
          await supabase.from("content_plans").update({ task_id: taskId } as never).eq("id", plan.id);
          toast.success("Task editor dibuat di Task Manager (Content Production)");
        }
      } else if (newKey === "done" && plan.task_id) {
        const { error } = await supabase.from("tasks").update({ status: "done" } as never).eq("id", plan.task_id);
        if (!error) toast.success("Task editor ditandai selesai");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Sync task error:", err);
      toast.warning("Plan tersimpan, tapi sinkronisasi task editor gagal: " + msg);
    }
  }`,
`  async function syncTaskForPlan(
    plan: {
      id: string;
      client_id: string;
      client_name?: string;
      pilar?: string | null;
      konten?: string | null;
      tema?: string | null;
      details?: string | null;
      reference?: string | null;
      tanggal_upload?: string | null;
    },
    newKey: string
  ) {
    try {
      if (!plan.id) return;
      // Link plan ↔ task via tasks.sheet_row_id (kolom sudah ada — tanpa migration)
      const linkKey = \`content_plan:\${plan.id}\`;
      if (newKey === "proses_edit") {
        // Hindari duplikat task editor untuk plan yang sama
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("sheet_row_id", linkKey)
          .limit(1)
          .maybeSingle();
        if (existing) return;
        const { data: userData } = await supabase.auth.getUser();
        const descParts: string[] = [];
        if (plan.pilar) descParts.push(\`Pilar: \${plan.pilar}\`);
        if (plan.konten) descParts.push(\`Konten: \${plan.konten}\`);
        if (plan.tema) descParts.push(\`Tema: \${plan.tema}\`);
        if (plan.details) descParts.push("", "Details:", plan.details);
        if (plan.reference) descParts.push("", \`Reference: \${plan.reference}\`);
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            title: \`[Content] \${plan.client_name || "Client"} — \${plan.tema || plan.konten || "Content Plan"}\`,
            description: descParts.join("\\n") || null,
            client_id: plan.client_id || null,
            priority: "medium",
            status: "todo",
            division: "Content Production",
            due_date: plan.tanggal_upload || null,
            created_by: userData.user?.id,
            sheet_row_id: linkKey,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        if (task) toast.success("Task editor dibuat di Task Manager (Content Production)");
      } else if (newKey === "done") {
        const { error } = await supabase
          .from("tasks")
          .update({ status: "done" } as never)
          .eq("sheet_row_id", linkKey);
        if (!error) toast.success("Task editor ditandai selesai");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Sync task error:", err);
      toast.warning("Plan tersimpan, tapi sinkronisasi task editor gagal: " + msg);
    }
  }`);

writeFileSync(pageFile, page);

// ── File 2: plan-detail-modal.tsx — sama, sheet_row_id ──
const modalFile = "src/components/content-plans/plan-detail-modal.tsx";
let modal = readFileSync(modalFile, "utf8");

// 2a. Interface: hapus task_id
modal = rep(modalFile, modal, "interface: hapus task_id",
`  tanggal_upload: string | null;
  progress: string | null;
  /** Task editor ter-link (dibuat otomatis saat progress → Proses Edit) */
  task_id: string | null;
}`,
`  tanggal_upload: string | null;
  progress: string | null;
}`);

// 2b. Trigger workflow → sheet_row_id
modal = rep(modalFile, modal, "trigger → sheet_row_id",
`      // Workflow trigger: Proses Edit = buat task editor; Done = selesaikan task
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
      }`,
`      // Workflow trigger: Proses Edit = buat task editor; Done = selesaikan task
      // Link plan ↔ task via tasks.sheet_row_id (tanpa migration tambahan)
      const newKey = getProgressKey(editForm.progress);
      const linkKey = \`content_plan:\${plan.id}\`;
      if (newKey === "proses_edit") {
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("sheet_row_id", linkKey)
          .limit(1)
          .maybeSingle();
        if (!existing) {
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
              sheet_row_id: linkKey,
            } as never)
            .select("id")
            .single();
          if (!taskError && task) {
            toast.success("Task editor dibuat di Task Manager (Content Production)");
          }
        }
      } else if (newKey === "done") {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ status: "done" } as never)
          .eq("sheet_row_id", linkKey);
        if (!taskError) toast.success("Task editor ditandai selesai");
      }`);

writeFileSync(modalFile, modal);
console.log("\nSemua patch v2 applied.");