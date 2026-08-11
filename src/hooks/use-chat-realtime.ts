"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

let realtimeClient: ReturnType<typeof createClient> | null = null;

// Singleton browser client (avoid recreating on every render)
function getRealtimeClient() {
  if (!realtimeClient) {
    realtimeClient = createClient();
  }
  return realtimeClient;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  message_type: string;
  metadata: any;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  mentions: string[] | null;
  is_pinned: boolean;
  deleted_at: string | null;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
  chat_reactions?: {
    id: string;
    user_id: string;
    emoji: string;
  }[];
}

export interface TypingUser {
  user_id: string;
  user_name: string;
}

export function useChatRealtime(channelId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map());
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, [channelId]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async (): Promise<boolean> => {
    if (!channelId || messages.length === 0) return false;
    try {
      const before = messages[0]?.created_at;
      const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=50&before=${encodeURIComponent(before)}`);
      if (res.ok) {
        const data = await res.json();
        const older = data.messages || [];
        if (older.length > 0) {
          setMessages((prev) => [...older, ...prev]);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [channelId, messages]);

  // Load messages when channel changes
  useEffect(() => {
    if (channelId) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [channelId, loadMessages]);

  // Subscribe to realtime updates
  useEffect(() => {
    const client = getRealtimeClient();
    if (!client || !channelId) return;

    // Database changes channel
    const dbChannel = client
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload: any) => {
          // Fetch full message with relations
          try {
            const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=1`);
            if (res.ok) {
              const data = await res.json();
              const newMsg = data.messages?.find((m: ChatMessage) => m.id === payload.new.id);
              if (newMsg) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
              }
            }
          } catch {
            // Fallback: use payload directly
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as ChatMessage];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.new.id
                ? {
                    ...m,
                    content: payload.new.content,
                    edited_at: payload.new.edited_at,
                    deleted_at: payload.new.deleted_at,
                  }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_reactions",
        },
        async (payload: any) => {
          // Update reactions on the message
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === payload.new.message_id) {
                const reactions = m.chat_reactions || [];
                if (!reactions.some((r: any) => r.id === payload.new.id)) {
                  return {
                    ...m,
                    chat_reactions: [...reactions, { id: payload.new.id, user_id: payload.new.user_id, emoji: payload.new.emoji }],
                  };
                }
              }
              return m;
            })
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_reactions",
        },
        (payload: any) => {
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              chat_reactions: (m.chat_reactions || []).filter((r: any) => r.id !== payload.old.id),
            }))
          );
        }
      )
      .subscribe((status: string) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = dbChannel;

    // Presence for online users
    const presenceChannel = client.channel(`presence:${channelId}`);
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Map<string, string>();
        Object.entries(state).forEach(([key, presences]: [string, any]) => {
          if (presences[0]?.user_name) {
            online.set(key, presences[0].user_name);
          }
        });
        setOnlineUsers(online);
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const { user_id, user_name } = payload.payload;
        if (user_id) {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.set(user_id, { user_id, user_name });
            return next;
          });
          // Clear typing after 3 seconds
          const existing = typingTimeoutRef.current.get(user_id);
          if (existing) clearTimeout(existing);
          typingTimeoutRef.current.set(
            user_id,
            setTimeout(() => {
              setTypingUsers((prev) => {
                const next = new Map(prev);
                next.delete(user_id);
                return next;
              });
            }, 3000)
          );
        }
      })
      .subscribe();

    return () => {
      dbChannel.unsubscribe();
      presenceChannel.unsubscribe();
      typingTimeoutRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutRef.current.clear();
    };
  }, [channelId]);

  // Broadcast typing indicator
  const broadcastTyping = useCallback(
    (userName: string, userId: string) => {
      const client = getRealtimeClient();
      if (!client || !channelId) return;
      client.channel(`presence:${channelId}`).send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: userId, user_name: userName },
      });
    },
    [channelId]
  );

  // Join presence
  const joinPresence = useCallback(
    (userName: string, userId: string) => {
      const client = getRealtimeClient();
      if (!client || !channelId) return;
      const ch = client.channel(`presence:${channelId}`);
      ch.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ user_name: userName, user_id: userId });
        }
      });
    },
    [channelId]
  );

  return {
    messages,
    setMessages,
    isConnected,
    typingUsers,
    onlineUsers,
    loadMessages,
    loadOlderMessages,
    broadcastTyping,
    joinPresence,
  };
}