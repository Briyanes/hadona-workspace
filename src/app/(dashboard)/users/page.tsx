"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, UserCog, ShieldCheck, ShieldOff, Loader2, Filter, CheckCircle2, XCircle, AlertTriangle, Trash2, UserPlus, Download } from "lucide-react";
import type { Database } from "@/types/database";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const ROLES = [
  { value: "super_admin", label: "Super Admin", color: "text-danger" },
  { value: "project_manager", label: "Project Manager", color: "text-warning" },
  { value: "creative_director", label: "Creative Director", color: "text-primary" },
  { value: "advertiser", label: "Advertiser", color: "text-success" },
  { value: "account_executive", label: "Account Executive", color: "text-success" },
  { value: "designer", label: "Designer", color: "text-muted" },
  { value: "copywriter", label: "Copywriter", color: "text-muted" },
  { value: "developer", label: "Developer", color: "text-muted" },
] as const;

const DIVISIONS = [
  "Creative Director",
  "Content Creator",
  "Production",
  "Project Manager",
  "Advertiser",
  "Account Executive",
  "Copywriter",
  "Developer",
] as const;

const DIVISION_COLORS: Record<string, string> = {
  "Creative Director": "bg-primary/15 text-primary",
  "Content Creator": "bg-success/15 text-success",
  Production: "bg-warning/15 text-warning",
  "Project Manager": "bg-accent/15 text-accent",
  Advertiser: "bg-danger/15 text-danger",
  "Account Executive": "bg-muted/20 text-muted",
  Copywriter: "bg-primary/15 text-primary",
  Developer: "bg-success/15 text-success",
};

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editDivisions, setEditDivisions] = useState<string[]>([]);
  const [editActive, setEditActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  // Delete user (soft or hard)
  const handleDelete = async (userId: string, mode: "soft" | "hard") => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/users?id=${userId}&mode=${mode}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast.success(mode === "hard" ? "User permanently deleted" : "User deactivated");
      setUsers(users.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
    setDeleting(false);
  };

  // Invite user by email
  const handleInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("Masukkan email yang valid");
      return;
    }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail, action: "invite" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
      fetchUsers(); // refresh list
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    }
    setInviting(false);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["Name", "Email", "Role", "Divisions", "Active", "Created At"];
    const rows = filtered.map((u) => [
      `"${u.full_name}"`,
      `"${u.email}"`,
      u.role,
      `"${(u.division || []).join("; ")}"`,
      u.is_active ? "Active" : "Inactive",
      new Date(u.created_at).toLocaleDateString("id-ID"),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hadona-users-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id || null);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Gagal memuat data user");
      console.error(error);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  function toggleEditDivision(value: string) {
    setEditDivisions((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  const handleSave = async (userId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: editRole, division: editDivisions.length > 0 ? editDivisions : null, is_active: editActive } as never)
      .eq("id", userId);

    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      toast.success("User berhasil diupdate");
      setUsers(
        users.map((u) =>
          u.id === userId
            ? { ...u, role: editRole, division: editDivisions.length > 0 ? editDivisions : null, is_active: editActive }
            : u
        )
      );
      setEditingId(null);
    }
    setSaving(false);
  };

  const startEdit = (user: Profile) => {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditDivisions(user.division || []);
    setEditActive(user.is_active);
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    const matchDivision =
      filterDivision === "all" || (u.division && u.division.includes(filterDivision));
    return matchSearch && matchRole && matchDivision;
  });

  const getRoleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || role;
  const getRoleColor = (role: string) => ROLES.find((r) => r.value === role)?.color || "text-muted";

  const { sortedData, sortState, toggleSort } = useSortable<Profile>({ data: filtered });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">User Management</h1>
          <p className="text-sm text-muted">Kelola tim, role, dan status akun</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
            title="Export CSV"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="btn-primary flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <UserPlus size={14} />
            <span>Invite User</span>
          </button>
        </div>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@hadona.id"
              className="input"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleInvite}
              disabled={inviting}
              className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {inviting ? "Sending..." : "Send Invite"}
            </button>
            <button
              onClick={() => { setShowInvite(false); setInviteEmail(""); }}
              className="btn-ghost px-4 py-2 text-xs"
            >
              Batal
            </button>
          </div>
        </div>
      )}

        {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted">Total User</p>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Active</p>
          <p className="text-2xl font-bold text-success">{users.filter((u) => u.is_active).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Inactive</p>
          <p className="text-2xl font-bold text-muted">
            {users.filter((u) => !u.is_active).length}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Not Onboarded</p>
          <p className="text-2xl font-bold text-danger">
            {users.filter((u) => !u.division || u.division.length === 0).length}
          </p>
        </div>
      </div>

      {/* Division Distribution */}
      <div className="card p-4">
        <p className="mb-2 text-xs font-medium text-muted">Distribusi Divisi</p>
        <div className="flex flex-wrap gap-2">
          {DIVISIONS.map((div) => {
            const count = users.filter((u) => u.division && u.division.includes(div)).length;
            return (
              <span
                key={div}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  DIVISION_COLORS[div] || "bg-muted/20 text-muted"
                )}
              >
                {div}
                <span className="rounded-full bg-white/30 px-1.5 text-[10px]">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Cari nama atau email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterDivision}
          onChange={(e) => setFilterDivision(e.target.value)}
          className="input sm:w-52"
        >
          <option value="all">Semua Divisi</option>
          {DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="input sm:w-48"
        >
          <option value="all">Semua Role</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* User Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-surface">
              <tr className="text-left text-xs text-muted">
                <SortableTh label="Nama" sortKey="full_name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  <SortableTh label="Email" sortKey="email" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                </th>
                <SortableTh label="Divisi" sortKey="division" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Role" sortKey="role" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Status" sortKey="is_active" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.map((user) => (
                <tr key={user.id} className="text-sm hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{user.full_name}</span>
                      {user.id === currentUserId && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted sm:hidden">{user.email}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{user.email}</td>

                  {/* Division */}
                  <td className="px-4 py-3">
                    {editingId === user.id ? (
                      <div className="flex flex-col gap-1 min-w-[160px]">
                        <div className="flex flex-wrap gap-1">
                          {DIVISIONS.map((d) => {
                            const checked = editDivisions.includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => toggleEditDivision(d)}
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  checked
                                    ? DIVISION_COLORS[d] || "bg-primary/15 text-primary"
                                    : "bg-muted/10 text-muted hover:bg-muted/20"
                                )}
                              >
                                {checked ? "✓ " : ""}{d}
                              </button>
                            );
                          })}
                        </div>
                        {editDivisions.length === 0 && (
                          <span className="text-[10px] text-danger">Pilih minimal 1</span>
                        )}
                      </div>
                    ) : (
                      user.division && user.division.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {user.division.map((d) => (
                            <span
                              key={d}
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                                DIVISION_COLORS[d] || "bg-muted/20 text-muted"
                              )}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs text-danger">
                          <AlertTriangle size={10} /> Belum onboarded
                        </span>
                      )
                    )}
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    {editingId === user.id ? (
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="input py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {editingId === user.id ? (
                      <button
                        onClick={() => setEditActive(!editActive)}
                        className="inline-flex items-center gap-1 text-xs font-medium underline"
                      >
                        {editActive ? (
                          <><CheckCircle2 size={12} className="text-success" /> Active</>
                        ) : (
                          <><XCircle size={12} className="text-muted" /> Inactive</>
                        )}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          user.is_active ? "text-success" : "text-muted"
                        }`}
                      >
                        {user.is_active ? (
                          <><CheckCircle2 size={12} /> Active</>
                        ) : (
                          <><XCircle size={12} /> Inactive</>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    {editingId === user.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSave(user.id)}
                          disabled={saving}
                          className="btn-primary px-3 py-1 text-xs"
                        >
                          {saving ? "..." : "Simpan"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs text-muted hover:text-gray-900"
                        >
                          Batal
                        </button>
                      </div>
                    ) : deleteConfirm === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDelete(user.id, "soft")}
                          disabled={deleting}
                          className="rounded bg-warning/15 px-2 py-1 text-[10px] font-medium text-warning hover:bg-warning/25"
                        >
                          {deleting ? "..." : "Deactivate"}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, "hard")}
                          disabled={deleting}
                          className="rounded bg-danger/15 px-2 py-1 text-[10px] font-medium text-danger hover:bg-danger/25"
                        >
                          {deleting ? "..." : "Delete"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-[10px] text-muted hover:text-gray-900"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => startEdit(user)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <UserCog size={14} />
                          Edit
                        </button>
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="text-danger hover:opacity-70"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              Tidak ada user yang cocok dengan pencarian.
            </div>
          )}
        </div>
      )}

      {/* Help Card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">Tentang Role & Hak Akses</p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>
                <span className="text-danger">Super Admin</span> &{" "}
                <span className="text-warning">Project Manager</span> bisa kelola semua data
                (clients, budgets, users, dll)
              </li>
              <li>
                <span className="text-success">Staff</span> (Advertiser, AE, Designer, dll) hanya
                bisa lihat data & manage tugas mereka sendiri
              </li>
              <li>
                <ShieldOff size={12} className="mr-1 inline" />
                User yang di-deactivate tidak bisa login, tapi datanya tetap tersimpan
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}