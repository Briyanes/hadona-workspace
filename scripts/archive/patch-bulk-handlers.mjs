// One-off patch: add .select("id") zero-row detection to handleBulkStatus & handleBulkPriority
// (updateStatus & handleBulkDelete already patched via run earlier). Safe to re-run (idempotent).
import fs from "fs";

const PATH = "src/components/tasks/task-board.tsx";
let s = fs.readFileSync(PATH, "utf8");
const before = s;
let applied = 0;

const OLD_STATUS = `  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("tasks")
      .update({ status: bulkStatus } as never)
      .in("id", ids);
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      toast.success(\`\${ids.length} task diupdate ke \${bulkStatus.replace("_", " ")}\`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkStatus("");
      loadTasks();
    }
  }`;

const NEW_STATUS = `  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // .select("id") → deteksi update yang diblokir RLS (0 rows = silent block, bukan error)
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: bulkStatus } as never)
      .in("id", ids)
      .select("id");
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      const updated = data?.length ?? 0;
      if (updated === 0) toast.error("Tidak ada izin mengubah task yang dipilih");
      else if (updated < ids.length) toast.warning(\`\${updated}/\${ids.length} task diupdate — sisanya diblokir izin\`);
      else toast.success(\`\${ids.length} task diupdate ke \${bulkStatus.replace("_", " ")}\`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkStatus("");
      loadTasks();
    }
  }`;

const OLD_PRIORITY = `  async function handleBulkPriority() {
    if (!bulkPriority || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("tasks")
      .update({ priority: bulkPriority } as never)
      .in("id", ids);
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      toast.success(\`\${ids.length} task priority diubah ke \${bulkPriority}\`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkPriority("");
      loadTasks();
    }
  }`;

const NEW_PRIORITY = `  async function handleBulkPriority() {
    if (!bulkPriority || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // .select("id") → deteksi update yang diblokir RLS (0 rows = silent block, bukan error)
    const { data, error } = await supabase
      .from("tasks")
      .update({ priority: bulkPriority } as never)
      .in("id", ids)
      .select("id");
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      const updated = data?.length ?? 0;
      if (updated === 0) toast.error("Tidak ada izin mengubah task yang dipilih");
      else if (updated < ids.length) toast.warning(\`\${updated}/\${ids.length} task diupdate — sisanya diblokir izin\`);
      else toast.success(\`\${ids.length} task priority diubah ke \${bulkPriority}\`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkPriority("");
      loadTasks();
    }
  }`;

if (s.includes(NEW_STATUS)) {
  console.log("handleBulkStatus: already patched");
} else if (s.includes(OLD_STATUS)) {
  s = s.replace(OLD_STATUS, NEW_STATUS);
  applied++;
  console.log("handleBulkStatus: PATCHED");
} else {
  console.error("handleBulkStatus: pattern NOT FOUND — abort");
  process.exit(1);
}

if (s.includes(NEW_PRIORITY)) {
  console.log("handleBulkPriority: already patched");
} else if (s.includes(OLD_PRIORITY)) {
  s = s.replace(OLD_PRIORITY, NEW_PRIORITY);
  applied++;
  console.log("handleBulkPriority: PATCHED");
} else {
  console.error("handleBulkPriority: pattern NOT FOUND — abort");
  process.exit(1);
}

if (applied > 0) fs.writeFileSync(PATH, s);
console.log("Done. select(\"id\") occurrences:", (s.match(/\.select\("id"\)/g) || []).length);