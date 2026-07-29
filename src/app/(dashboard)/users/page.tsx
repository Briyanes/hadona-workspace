"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, UserCog, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import type { Database } from "@/types/database";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";

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

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const handleSave = async (userId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: editRole, is_active: editActive } as never)
      .eq("id", userId);

    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      toast.success("User berhasil diupdate");
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, role: editRole, is_active: editActive } : u))
      );
      setEditingId(null);
    }
    setSaving(false);
  };

  const startEdit = (user: Profile) => {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditActive(user.is_active);
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const getRoleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || role;
  const getRoleColor = (role: string) => ROLES.find((r) => r.value === role)?.color || "text-muted";

  const { sortedData, sortState, toggleSort } = useSortable<Profile>({ data: filtered });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-sm text-muted">Kelola tim, role, dan status akun</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted">Total User</p>
          <p className="text-2xl font-bold text-white">{users.length}</p>
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
          <p className="text-xs text-muted">Managers</p>
          <p className="text-2xl font-bold text-warning">
            {users.filter((u) => u.role === "super_admin" || u.role === "project_manager").length}
          </p>
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
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="input sm:w-52"
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
                      <span className="font-medium text-white">{user.full_name}</span>
                      {user.id === currentUserId && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted sm:hidden">{user.email}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{user.email}</td>

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
                        className="text-xs font-medium underline"
                      >
                        {editActive ? "🟢 Active" : "🔴 Inactive"}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          user.is_active ? "text-success" : "text-muted"
                        }`}
                      >
                        {user.is_active ? "🟢 Active" : "🔴 Inactive"}
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
                          className="px-3 py-1 text-xs text-muted hover:text-white"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(user)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <UserCog size={14} />
                        Edit
                      </button>
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
            <p className="font-medium text-white">Tentang Role & Hak Akses</p>
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