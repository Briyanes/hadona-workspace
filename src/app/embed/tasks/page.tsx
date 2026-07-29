"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, Loader, XCircle } from "lucide-react";

// This page is designed to be embedded in a WorkAdventure iframe popup.
// It reads a Supabase access_token from URL search params (?token=xxx)
// to authenticate without requiring a separate login.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface EmbedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  client?: { name: string };
}

export default function EmbedTasksPage() {
  const [tasks, setTasks] = useState<EmbedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("No auth token provided");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    async function load() {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, client:clients(name)")
        .order("due_date", { ascending: true })
        .limit(20);

      if (error) {
        setError(error.message);
      } else {
        setTasks((data as unknown as EmbedTask[]) || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-4 text-center">
        <XCircle className="text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  const statusIcons: Record<string, React.ReactNode> = {
    todo: <Circle size={16} className="text-muted" />,
    in_progress: <Clock size={16} className="text-warning" />,
    review: <Loader size={16} className="text-accent" />,
    done: <CheckCircle2 size={16} className="text-success" />,
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <span className="flex h-6 w-6 items-center justify-center rounded gradient-primary text-[10px]">H</span>
          My Tasks
        </h1>
      </header>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted">Tidak ada tugas</p>
          </div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2 rounded-md border border-border bg-surface p-2.5">
              {statusIcons[t.status]}
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-900">{t.title}</p>
                {t.client && <p className="text-[10px] text-muted">{t.client.name}</p>}
              </div>
              {t.due_date && (
                <span className="text-[10px] text-muted">
                  {new Date(t.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}