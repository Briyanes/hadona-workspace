"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatRealtime, type ChatMessage } from "@/hooks/use-chat-realtime";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ============================
// Types
// ============================
interface Channel {
  id: string;
  name: string;
  type: string;
  division: string | null;
  created_by: string | null;
  created_at: string;
  unread_count?: number;
}

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

const EMOJI_LIST = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "🙏", "💪"];

// ============================
// Channel Sidebar
// ============================
function ChannelSidebar({
  channels,
  activeChannelId,
  onSelect,
  onNewDM,
}: {
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
  onNewDM: () => void;
}) {
  const generalChannels = channels.filter((c: Channel) => c.type === "general" || c.type === "announcement");
  const divisionChannels = channels.filter((c: Channel) => c.type === "division");
  const dmChannels = channels.filter((c: Channel) => c.type === "dm");

  const getDisplayName = (ch: Channel) => {
    if (ch.type === "dm") {
      return ch.name.replace(/__/g, " · ");
    }
    return ch.name;
  };

  const renderChannel = (ch: Channel) => (
    <button
      key={ch.id}
      onClick={() => onSelect(ch.id)}
      className={cn(
        "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors",
        activeChannelId === ch.id
          ? "bg-primary/15 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-2 truncate">
        {ch.type === "announcement" ? "📢" : ch.type === "division" ? "🏠" : ch.type === "dm" ? "💬" : "#"} {getDisplayName(ch)}
      </span>
      {(ch.unread_count || 0) > 0 && (
        <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
          {ch.unread_count}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Channels
        </p>
        <div className="flex flex-col gap-0.5">
          {generalChannels.length === 0 ? (
            <p className="px-3 text-xs text-muted-foreground italic">Belum ada channel</p>
          ) : (
            generalChannels.map(renderChannel)
          )}
        </div>
      </div>
      {divisionChannels.length > 0 && (
        <div>
          <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Divisi
          </p>
          <div className="flex flex-col gap-0.5">
            {divisionChannels.map(renderChannel)}
          </div>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between px-3 mb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Direct Messages
          </p>
          <button
            onClick={onNewDM}
            className="text-muted-foreground hover:text-primary text-sm"
            title="New DM"
          >
            ✏
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {dmChannels.length === 0 ? (
            <p className="px-3 text-xs text-muted-foreground italic">Belum ada DM</p>
          ) : (
            dmChannels.map(renderChannel)
          )}
        </div>
      </div>
    </div>
  );
}

// ============================
// Reaction Picker
// ============================
function ReactionPicker({
  onReact,
  onClose,
}: {
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 -top-10 left-4 bg-popover border rounded-lg shadow-lg p-1.5 flex gap-0.5">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded transition-colors text-base"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

// ============================
// Message Item
// ============================
function MessageItem({
  msg,
  currentUserId,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: {
  msg: ChatMessage;
  currentUserId: string;
  onReply: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const initials = (msg.profiles?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const timeStr = format(new Date(msg.created_at), "HH:mm");
  const isEdited = !!msg.edited_at;
  const isDeleted = !!msg.deleted_at;

  // System message
  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  // Call link message
  if (msg.message_type === "call_link") {
    const meetLink = (msg.metadata as { meet_link?: string })?.meet_link || msg.content;
    return (
      <div className="group flex gap-3 px-4 py-2 hover:bg-muted/50 rounded-lg transition-colors">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center">
          📹
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{msg.profiles?.full_name || "Unknown"}</span>
            <span className="text-xs text-muted-foreground">{timeStr}</span>
          </div>
          <div className="mt-1 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm font-medium mb-2">Memulai panggilan video 🎥</p>
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              📹 Join Call
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Group reactions by emoji
  const reactionsByEmoji: Record<string, { users: string[]; mine: boolean }> = {};
  (msg.chat_reactions || []).forEach((r) => {
    if (!reactionsByEmoji[r.emoji]) {
      reactionsByEmoji[r.emoji] = { users: [], mine: false };
    }
    reactionsByEmoji[r.emoji].users.push(r.user_id);
    if (r.user_id === currentUserId) {
      reactionsByEmoji[r.emoji].mine = true;
    }
  });

  return (
    <div
      className="group relative flex gap-3 px-4 py-1 hover:bg-muted/30 rounded-lg transition-colors"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactionPicker(false); }}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold text-primary">
        {msg.profiles?.avatar_url ? (
          <img src={msg.profiles.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm">{msg.profiles?.full_name || "Unknown"}</span>
          {msg.profiles?.role && (
            <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded">
              {msg.profiles.role.replace(/_/g, " ")}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{timeStr}</span>
          {isEdited && <span className="text-xs text-muted-foreground italic">(diedit)</span>}
        </div>

        {msg.reply_to && (
          <div className="text-xs text-muted-foreground border-l-2 border-border pl-2 mb-1 mt-0.5">
            Membalas pesan
          </div>
        )}

        {isDeleted ? (
          <p className="text-sm text-muted-foreground italic mt-0.5">🗑️ Pesan ini telah dihapus</p>
        ) : (
          <div className="text-sm text-foreground mt-0.5 prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-pre:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}

        {/* Reactions display */}
        {!isDeleted && Object.keys(reactionsByEmoji).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(reactionsByEmoji).map(([emoji, info]) => (
              <button
                key={emoji}
                onClick={() => onReact(msg.id, emoji)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                  info.mine
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "bg-muted border-transparent hover:bg-muted/80"
                )}
              >
                <span>{emoji}</span>
                <span className="font-medium">{info.users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !isDeleted && (
        <div className="absolute -top-3 right-4 flex items-center gap-0.5 bg-popover border rounded-lg shadow-sm p-0.5">
          {showReactionPicker && (
            <ReactionPicker
              onReact={(emoji) => onReact(msg.id, emoji)}
              onClose={() => setShowReactionPicker(false)}
            />
          )}
          <button
            onClick={() => setShowReactionPicker((s) => !s)}
            className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded text-sm"
            title="React"
          >
            😀
          </button>
          <button
            onClick={() => onReply(msg)}
            className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded text-sm"
            title="Reply"
          >
            ↩
          </button>
          {msg.user_id === currentUserId && (
            <>
              <button
                onClick={() => onEdit(msg)}
                className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded text-sm"
                title="Edit"
              >
                ✏
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="w-7 h-7 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive rounded text-sm"
                title="Delete"
              >
                🗑
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================
// Chat Area
// ============================
function ChatArea({
  channelId,
  channelName,
  channelType,
  currentUserId,
  currentUserName,
  onStartCall,
}: {
  channelId: string;
  channelName: string;
  channelType: string;
  currentUserId: string;
  currentUserName: string;
  onStartCall: () => void;
}) {
  const {
    messages,
    setMessages,
    isConnected,
    typingUsers,
    onlineUsers,
    loadMessages,
    loadOlderMessages,
    broadcastTyping,
    joinPresence,
  } = useChatRealtime(channelId);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Join presence
  useEffect(() => {
    if (currentUserId && currentUserName) {
      joinPresence(currentUserName, currentUserId);
    }
  }, [channelId, currentUserId, currentUserName, joinPresence]);

  // Auto-scroll to bottom on new message
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Detect scroll position
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  // Load older messages when scrolling to top
  const handleScrollTop = async () => {
    const container = messagesContainerRef.current;
    if (!container || container.scrollTop > 50 || loadingOlder) return;
    setLoadingOlder(true);
    const prevHeight = container.scrollHeight;
    const hadMore = await loadOlderMessages();
    if (hadMore) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - prevHeight;
        }
      });
    }
    setLoadingOlder(false);
  };

  // Send message
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (editingMsg) {
        // Edit existing message
        const res = await fetch("/api/chat/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: editingMsg.id, content: text }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Gagal mengedit pesan");
        }
        setEditingMsg(null);
      } else {
        // Send new message
        const body: Record<string, unknown> = {
          channel_id: channelId,
          content: text,
        };
        if (replyTo) {
          body.reply_to = replyTo.id;
        }
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Gagal mengirim pesan");
        }
        if (replyTo) setReplyTo(null);
      }
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setEditingMsg(null);
      setReplyTo(null);
      setInput("");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
    // Broadcast typing
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      broadcastTyping(currentUserName, currentUserId);
    }, 300);
  };

  // Reaction toggle
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
    } catch {
      toast.error("Gagal menambahkan reaksi");
    }
  };

  // Delete message
  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await fetch(`/api/chat/messages?messageId=${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error("Gagal menghapus pesan");
    }
  };

  // Start editing
  const handleEdit = (msg: ChatMessage) => {
    setEditingMsg(msg);
    setInput(msg.content);
    textareaRef.current?.focus();
  };

  // Typing indicator text
  const typingArray = Array.from(typingUsers.values()).filter((t) => t.user_id !== currentUserId);
  const typingText =
    typingArray.length === 0
      ? ""
      : typingArray.length === 1
      ? `${typingArray[0].user_name} sedang mengetik...`
      : `${typingArray.length} orang sedang mengetik...`;

  // Online count
  const onlineCount = onlineUsers.size;

  return (
    <div className="flex flex-col h-full">
      {/* Channel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">
            {channelType === "dm" ? "💬" : channelType === "announcement" ? "📢" : "#"}
          </span>
          <h2 className="font-semibold truncate">{channelName}</h2>
          {onlineCount > 0 && (
            <span className="flex-shrink-0 flex items-center gap-1 text-xs text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {onlineCount} online
            </span>
          )}
        </div>
        <button
          onClick={onStartCall}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          📹 Call
        </button>
      </div>

      {/* Connection status */}
      {!isConnected && (
        <div className="px-4 py-1 bg-yellow-500/10 text-yellow-700 text-xs text-center">
          Menghubungkan ke realtime...
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={(e) => {
          handleScroll();
          handleScrollTop();
        }}
        className="flex-1 overflow-y-auto py-4 space-y-0.5 relative"
      >
        {loadingOlder && (
          <div className="text-center text-xs text-muted-foreground py-2">Memuat pesan lama...</div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <span className="text-4xl">💬</span>
            <p className="text-sm">Belum ada pesan. Sapa tim pertama!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              currentUserId={currentUserId}
              onReply={setReplyTo}
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
        <div ref={messagesEndRef} />

        {/* Typing indicator */}
        {typingText && (
          <div className="px-4 py-1 text-xs text-muted-foreground flex items-center gap-2">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            {typingText}
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-8 w-9 h-9 rounded-full bg-popover border shadow-lg flex items-center justify-center hover:bg-muted transition-colors z-10"
        >
          ↓
        </button>
      )}

      {/* Reply / Edit indicator */}
      {(replyTo || editingMsg) && (
        <div className="px-4 py-1.5 border-t bg-muted/30 flex items-center justify-between text-xs">
          <span className="text-muted-foreground truncate">
            {editingMsg ? `✏ Mengedit pesan` : `↩ Membalas ${replyTo?.profiles?.full_name || "pesan"}`}
          </span>
          <button
            onClick={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }}
            className="text-muted-foreground hover:text-destructive flex-shrink-0"
          >
            ✕ Batal
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-4 bg-background">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Pesan ke ${channelType === "dm" ? "" : "#"}${channelName}...`}
              rows={1}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          Enter untuk kirim · Shift+Enter baris baru · Esc batal · Markdown didukung
        </p>
      </div>
    </div>
  );
}

// ============================
// New DM Modal
// ============================
function NewDMModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (userId: string) => void;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.members || data.users || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) =>
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Pilih anggota untuk DM</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4">
          <input
            type="text"
            placeholder="Cari nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
            autoFocus
          />
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Memuat...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Tidak ada user ditemukan</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onPick(u.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted text-sm text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                    {(u.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <span>{u.full_name}</span>
                  <span className="text-xs text-muted-foreground">{u.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================
// Main Chat Page
// ============================
export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showDMModal, setShowDMModal] = useState(false);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  // Load current user
  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => {
        const me = (data.members || data.users || []).find(
          (u: UserProfile & { is_me?: boolean }) => u.is_me
        );
        if (me) setCurrentUser(me);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  // Mark as read when switching channels
  useEffect(() => {
    if (!activeChannelId) return;
    fetch("/api/chat/read-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: activeChannelId }),
    }).catch(() => {});
  }, [activeChannelId]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Start Google Meet call
  const handleStartCall = async () => {
    if (!activeChannelId) return;
    try {
      const res = await fetch("/api/google/create-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal membuat Google Meet");
      }
      const data = await res.json();
      const meetLink = data.meetLink || data.event?.hangoutLink;
      if (!meetLink) throw new Error("Meet link tidak ditemukan");

      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: activeChannelId,
          content: meetLink,
          message_type: "call_link",
          metadata: { meet_link: meetLink },
        }),
      });

      toast.success("Link call dikirim ke channel!");
      window.open(meetLink, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat call");
    }
  };

  // Create DM channel
  const handleCreateDM = async (targetUserId: string) => {
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dm", dm_with: targetUserId }),
      });
      if (!res.ok) throw new Error("Gagal membuat DM");
      const data = await res.json();
      if (data.channel) {
        await loadChannels();
        setActiveChannelId(data.channel.id);
      }
      setShowDMModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat DM");
    }
  };

  return (
    <>
      <PageHeader title="Team Chat" />
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        Chat internal tim, DM, video call, dan kolaborasi real-time
      </p>

      <div className="flex h-[calc(100vh-180px)] rounded-xl border bg-card overflow-hidden">
        {/* Left: Channel Sidebar */}
        <div className="w-64 flex-shrink-0 border-r bg-muted/30 p-3 overflow-y-auto hidden md:block">
          {loadingChannels ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Memuat...
            </div>
          ) : (
            <ChannelSidebar
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={setActiveChannelId}
              onNewDM={() => setShowDMModal(true)}
            />
          )}
        </div>

        {/* Center: Chat Area */}
        <div className="flex-1 min-w-0">
          {activeChannel ? (
            <ChatArea
              channelId={activeChannel.id}
              channelName={activeChannel.type === "dm" ? activeChannel.name.replace(/__/g, " · ") : activeChannel.name}
              channelType={activeChannel.type}
              currentUserId={currentUser?.id || ""}
              currentUserName={currentUser?.full_name || "User"}
              onStartCall={handleStartCall}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Pilih channel untuk mulai chat
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Channel selector */}
      <div className="md:hidden mt-4">
        <details className="rounded-lg border bg-card">
          <summary className="px-4 py-2 text-sm font-medium cursor-pointer">
            Pilih Channel {activeChannel && `· ${activeChannel.type === "dm" ? "💬" : "#"}${activeChannel.name}`}
          </summary>
          <div className="p-3 border-t">
            <ChannelSidebar
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={setActiveChannelId}
              onNewDM={() => setShowDMModal(true)}
            />
          </div>
        </details>
      </div>

      {/* DM Modal */}
      {showDMModal && (
        <NewDMModal onClose={() => setShowDMModal(false)} onPick={handleCreateDM} />
      )}
    </>
  );
}