"use client";
/**
 * useUnreadNotifications — notif unread (bell) + chat unread (badge FAB/nav).
 * chatCount via RPC get_chat_unread_total (v103) — akurat & auto-clear saat dibaca.
 */
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export function useUnreadNotifications() {
  const [count, setCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCount(0);
        setChatCount(0);
        return;
      }
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (!error && count !== null) setCount(count);

      // RPC v103: total unread chat di semua channel (berdasarkan read receipts)
      const { data: chatUnread, error: rpcErr } = await supabase.rpc("get_chat_unread_total");
      if (!rpcErr && typeof chatUnread === "number") setChatCount(chatUnread);
    } catch {
      // silent — RPC mungkin belum termigrasi
    }
  }, []);

  useEffect(() => {
    refresh();
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-unread-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (p) => {
        if (p.new?.read === false) setCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (p) => {
        if (p.new?.read === true) refresh();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, () => refresh())
      // Chat: pesan baru / read receipt berubah → refresh badge chat
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => setChatCount((c) => c + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_read_receipts" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const clearChat = useCallback(() => setChatCount(0), []);

  return { count, chatCount, refresh, clearChat };
}