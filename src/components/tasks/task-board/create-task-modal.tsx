"use client";

import { useEffect, useState } from 'react';
import { Lightbulb, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Modal } from "@/components/ui/modal";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { emptyTaskForm } from "./constants";
import type { Client, TaskForm } from "./types";

interface CreateTaskModalProps {
  clients: Client[];
  /** Division filter active on the board — locks the division field when set */
  activeDivision: string | null;
  /** Division default dari sub-page (mis. /tasks/editor) */
  defaultDivision: string;
  /**
   * Dipanggil saat submit. Return `true` = sukses (form di-reset).
   * Validasi, dup-check & insert tetap di parent (punya akses tasks).
   */
  onCreate: (form: TaskForm, assigneeIds: string[]) => Promise<boolean>;
  onClose: () => void;
}

const FORM_ID = "create-task-form";

/**
 * Create Task modal — 2-column layout with sticky header & footer.
 *
 * ⚡ State form LOKAL di komponen ini (bukan di parent TaskBoard).
 * Sebelumnya state ada di parent, sehingga SETIAP ketikan me-render ulang
 * seluruh board (ratusan kartu + tabel) → input terasa lag / karakter muncul
 * satu-satu. Dengan state lokal, ketikan hanya me-render modal ini.
 */
export function CreateTaskModal({
  clients,
  activeDivision,
  defaultDivision,
  onCreate,
  onClose,
}: CreateTaskModalProps) {
  const [form, setForm] = useState<TaskForm>(() => emptyTaskForm(defaultDivision));
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Sync division field saat filter divisi di board berubah
  useEffect(() => {
    setForm((f) => ({ ...f, division: activeDivision || defaultDivision }));
  }, [activeDivision, defaultDivision]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // guard: mencegah double-submit saat request masih berjalan
    if (!form.title.trim()) {
      toast.error("Judul task wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const ok = await onCreate(form, assigneeIds);
      if (ok) {
        setForm(emptyTaskForm(defaultDivision));
        setAssigneeIds([]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Buat Task Baru"
      size="lg"
      scrollable
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Batal
          </button>
          <button type="submit" form={FORM_ID} disabled={saving} className="btn-primary">
            {saving ? "Menyimpan..." : "Simpan Task"}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Full-width: Title */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Judul Task *</label>
          <input
            type="text"
            required
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Contoh: Setup Campaign Meta Ads Client X"
            className="input"
          />
        </div>

        {/* Full-width: Description */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Deskripsi</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Detail tugas (opsional)"
            className="input resize-none"
          />
        </div>

        {/* LEFT column fields */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Client</label>
            <select
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              className="input"
            >
              <option value="">— Pilih Client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Status Awal</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="input"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Result / Output</label>
            <input
              type="text"
              value={form.result}
              onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
              placeholder="Contoh: Monthly report selesai"
              className="input"
            />
          </div>
        </div>

        {/* RIGHT column fields */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Prioritas</label>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="input"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Divisi</label>
            <select
              value={form.division}
              onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}
              className="input"
              // Lock division when on a sub-page (division prop is set)
              disabled={!!activeDivision}
            >
              <option value="">— Pilih Divisi —</option>
              <option value="Creative Director">Creative Director</option>
              <option value="Content Creator">Content Creator</option>
              <option value="Editor">Editor</option>
              <option value="Production">Production</option>
              <option value="Social Media Manager">Social Media Manager</option>
              <option value="Project Manager">Project Manager</option>
              <option value="Advertiser">Advertiser</option>
              <option value="Account Executive">Account Executive</option>
              <option value="Copywriter">Copywriter</option>
              <option value="Developer">Developer</option>
            </select>
            {activeDivision && (
              <p className="mt-1 text-xs text-muted"><Lock size={12} className="inline" /> Division terkunci: <strong>{activeDivision}</strong></p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Deadline</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Blocker / Kendala
            </label>
            <textarea
              rows={2}
              value={form.blocker}
              onChange={(e) => setForm((f) => ({ ...f, blocker: e.target.value }))}
              placeholder="Isi jika ada kendala..."
              className="input resize-none"
            />
          </div>
        </div>

        {/* Full-width: Assignees */}
        <div className="lg:col-span-2">
          <AssigneePicker
            selectedIds={assigneeIds}
            onChange={setAssigneeIds}
            label="Assignee"
            divisionFilter={form.division || null}
          />
          {form.division && (
            <p className="mt-1.5 flex items-start gap-1 text-xs text-muted">
              <Lightbulb size={12} className="mt-0.5 shrink-0 text-warning" />
              <span>Assignee difilter otomatis berdasarkan divisi <strong>{form.division}</strong></span>
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}