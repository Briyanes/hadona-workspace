// One-off patch: add .select("id") zero-row RLS detection to task-detail-modal.tsx
// handlers: handleSave, handleDelete, handleApproval. Idempotent — safe to re-run.
import fs from "fs";

const PATH = "src/components/tasks/task-detail-modal.tsx";
let s = fs.readFileSync(PATH, "utf8");
let applied = 0;

// ---- 1. handleSave: update tasks ----
const OLD_SAVE = `    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        priority: editForm.priority,
        division: editForm.division || null,
        due_date: editForm.due_date || null,
        start_date: editForm.start_date || null,
        result: editForm.result.trim() || null,
        notes: editForm.notes.trim() || null,
      } as never)
      .eq("id", taskId);

    if (error) {
      toast.error("Gagal update task: " + error.message);
    } else {`;

const NEW_SAVE = `    setSaving(true);
    // .select("id") → deteksi update yang diblokir RLS (0 rows = silent block, bukan error)
    const { data: saveData, error } = await supabase
      .from("tasks")
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        priority: editForm.priority,
        division: editForm.division || null,
        due_date: editForm.due_date || null,
        start_date: editForm.start_date || null,
        result: editForm.result.trim() || null,
        notes: editForm.notes.trim() || null,
      } as never)
      .eq("id", taskId)
      .select("id");

    if (error) {
      toast.error("Gagal update task: " + error.message);
    } else if (!saveData || saveData.length === 0) {
      toast.error("Tidak ada izin mengubah task ini. Perubahan tidak disimpan.");
    } else {`;

// ---- 2. handleDelete ----
const OLD_DEL = `    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      toast.error("Gagal hapus task: " + error.message);
      setConfirmDelete(false);
      return;
    }
    toast.success("Task berhasil dihapus");`;

const NEW_DEL = `    // .select("id") → deteksi delete yang diblokir RLS (0 rows = silent block, bukan error)
    const { data: delData, error } = await supabase.from("tasks").delete().eq("id", taskId).select("id");
    if (error) {
      toast.error("Gagal hapus task: " + error.message);
      setConfirmDelete(false);
      return;
    }
    if (!delData || delData.length === 0) {
      toast.error("Tidak ada izin menghapus task ini.");
      setConfirmDelete(false);
      return;
    }
    toast.success("Task berhasil dihapus");`;

// ---- 3. handleApproval ----
const OLD_APPR = `    setApproving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        approval_status: action,
        approved_by: currentUserId,
        approved_at: new Date().toISOString(),
        approval_note: approvalNote.trim() || null,
      } as never)
      .eq("id", taskId);

    if (error) {
      toast.error("Gagal update approval: " + error.message);
    } else {`;

const NEW_APPR = `    setApproving(true);
    // .select("id") → deteksi update yang diblokir RLS (0 rows = silent block, bukan error)
    const { data: apprData, error } = await supabase
      .from("tasks")
      .update({
        approval_status: action,
        approved_by: currentUserId,
        approved_at: new Date().toISOString(),
        approval_note: approvalNote.trim() || null,
      } as never)
      .eq("id", taskId)
      .select("id");

    if (error) {
      toast.error("Gagal update approval: " + error.message);
    } else if (!apprData || apprData.length === 0) {
      toast.error("Tidak ada izin memberi approval pada task ini.");
    } else {`;

function patch(name, oldStr, newStr) {
  if (s.includes(newStr)) {
    console.log(name + ": already patched");
  } else if (s.includes(oldStr)) {
    s = s.replace(oldStr, newStr);
    applied++;
    console.log(name + ": PATCHED");
  } else {
    console.error(name + ": pattern NOT FOUND — abort");
    process.exit(1);
  }
}

patch("handleSave", OLD_SAVE, NEW_SAVE);
patch("handleDelete", OLD_DEL, NEW_DEL);
patch("handleApproval", OLD_APPR, NEW_APPR);

if (applied > 0) fs.writeFileSync(PATH, s);
console.log("Done. select-id count:", (s.match(/\.select\("id"\)/g) || []).length);