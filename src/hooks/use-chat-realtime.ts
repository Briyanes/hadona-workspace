import { useEffect, useRef, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"] & {
  profiles?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
};

export type ChatChannel = Database["public"]["Tables"]["chat_channels"]["Row"] & {
  unread_count?: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function useChatRealtime(channelId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient<Database>> | null>(null);

  // Initialize browser client
  if (!supabaseRef.current && supabaseUrl && supabaseAnonKey) {
    supabaseRef.current = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  const supabase = supabaseRef.current;

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=50`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load messages (${res.status})`);
      }
      const data = await res.json();
      setMessages(data.messages || []);
      setLoading(false);

      // Mark as read (fire-and-forget, don't crash on failure)
      fetch("/api/chat/read-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
      }).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memuat pesan";
      setError(msg);
      setMessages([]);
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime
  useEffect(() => {
    if (!channelId || !supabase) return;

    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          // Fetch profile data for the new message
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url, role")
              .eq("id", newMsg.user_id)
              .single();

            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, profiles: profile || undefined }];
            });
          } catch {
            // If profile fetch fails, still add the message without profile
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, profiles: undefined }];
            });
          }

          // Auto-mark as read since we're viewing this channel
          fetch("/api/chat/read-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: channelId }),
          }).catch(() => {});
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, options?: { message_type?: string; metadata?: Record<string, unknown>; reply_to?: string | null }) => {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          content,
          message_type: options?.message_type || "text",
          metadata: options?.metadata || {},
          reply_to: options?.reply_to || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send message" }));
        throw new Error(err.error || "Failed to send message");
      }

      // The realtime subscription will handle adding the message
      return res.json();
    },
    [channelId]
  );

  // Delete message
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await fetch(`/api/chat/messages?id=${messageId}`, { method: "DELETE" });
    } catch {
      // Silently fail - realtime will handle state
    }
  }, []);

  return { messages, loading, error, sendMessage, deleteMessage, refetch: fetchMessages };
}

// Hook for channels list with realtime unread updates
export function useChatChannels() {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient<Database>> | null>(null);

  if (!supabaseRef.current && supabaseUrl && supabaseAnonKey) {
    supabaseRef.current = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  const supabase = supabaseRef.current;

  const fetchChannels = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/chat/channels");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load channels (${res.status})`);
      }
      const data = await res.json();
      setChannels(data.channels || []);
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memuat channel";
      setError(msg);
      setChannels([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Realtime: listen for new messages across all channels to update unread
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("chat-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => {
          // Refetch channels to update unread counts
          fetchChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchChannels]);

  return { channels, loading, error, refetch: fetchChannels };
}