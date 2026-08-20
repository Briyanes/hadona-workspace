"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChatRealtime, type ChatMessage } from "@/hooks/use-chat-realtime";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
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
  is_private?: boolean;
  member_count?: number;
  members?: { user_id: string; role: string }[];
  is_owner?: boolean;
  my_role?: string | null;
}

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  is_me?: boolean;
  division?: string;
}

interface ActiveCall {
  id: string;
  channel_id: string;
  started_by: string;
  jitsi_room: string;
  started_at: string;
  ended_at: string | null;
  starter_profile?: { full_name: string; avatar_url: string | null } | null;
}

const EMOJI_LIST = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "🙏", "💪"];

// Warna nama unik per user (ala WhatsApp)
const NAME_COLORS = [
  "text-blue-500", "text-green-600", "text-purple-500", "text-orange-500",
  "text-pink-500", "text-teal-600", "text-indigo-500", "text-red-500",
];
function nameColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

function initialsOf(name?: string | null) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ============================
// Date separator
// ============================
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const label = isToday(d) ? "Hari Ini" : isYesterday(d) ? "Kemarin" : format(d, "d MMMM yyyy");
  return (
    <div className="flex items-center justify-center gap-3 my-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ============================
// Channel Sidebar
// ============================
function ChannelSidebar({
  channels,
  activeChannelId,
  activeCalls,
  onSelect,
  onNewDM,
  onNewGroup,
}: {
  channels: Channel[];
  activeChannelId: string | null;
  activeCalls: ActiveCall[];
  onSelect: (id: string) => void;
  onNewDM: () => void;
  onNewGroup: () => void;
}) {
  const generalChannels = channels.filter((c) => c.type === "general" || c.type === "announcement");
  const divisionChannels = channels.filter((c) => c.type === "division");
  const groupChannels = channels.filter((c) => c.type === "group");
  const dmChannels = channels.filter((c) => c.type === "dm");

  const getDisplayName = (ch: Channel) => {
    if (ch.type === "dm") return ch.name.replace(/__/g, " · ");
    return ch.name;
  };

  const renderChannel = (ch: Channel) => {
    const hasCall = activeCalls.some((c) => c.channel_id === ch.id);
    return (
      <button
        key={ch.id}
        onClick={() => onSelect(ch.id)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors group",
          activeChannelId === ch.id
            ? "bg-primary/15 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {ch.type === "announcement" ? "📢" : ch.type === "division" ? "🏠" : ch.type === "group" ? "👥" : ch.type === "dm" ? "💬" : "#"}
          <span className="truncate">{getDisplayName(ch)}</span>
          {ch.type === "group" && (ch.member_count || 0) > 0 && (
            <span className="text-[10px] text-muted-foreground/70">{ch.member_count}</span>
          )}
          {hasCall && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full animate-pulse">
              ● LIVE
            </span>
          )}
        </span>
        {(ch.unread_count || 0) > 0 && (
          <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
            {ch.unread_count}
          </span>
        )}
      </button>
    );
  };

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
            Grup
          </p>
          <button
            onClick={onNewGroup}
            className="text-muted-foreground hover:text-primary text-base leading-none"
            title="Buat grup baru"
          >
            ＋
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {groupChannels.length === 0 ? (
            <button
              onClick={onNewGroup}
              className="px-3 text-xs text-muted-foreground italic hover:text-primary text-left"
            >
              Buat grup pertama kamu ➕
            </button>
          ) : (
            groupChannels.map(renderChannel)
          )}
        </div>
      </div>
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
      <div className="absolute z-50 bottom-full mb-1 left-0 bg-popover border rounded-full shadow-lg p-1.5 flex gap-0.5">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-transform hover:scale-125 text-base"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

// ============================
// Message Bubble (WhatsApp style)
// ============================
function MessageBubble({
  msg,
  isMine,
  isGrouped,
  showName,
  replyToMsg,
  currentUserId,
  highlight,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onJumpTo,
}: {
  msg: ChatMessage;
  isMine: boolean;
  isGrouped: boolean;
  showName: boolean;
  replyToMsg: ChatMessage | null;
  currentUserId: string;
  highlight: boolean;
  onReply: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (id: string) => void;
  onJumpTo: (id: string) => void;
}) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const timeStr = format(new Date(msg.created_at), "HH:mm");
  const isEdited = !!msg.edited_at;

  // System message — center pill
  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  // Call link message (legacy Google Meet)
  if (msg.message_type === "call_link") {
    const meetLink = (msg.metadata as { meet_link?: string })?.meet_link || msg.content;
    return (
      <div className={cn("flex my-1 px-2", isMine ? "justify-end" : "justify-start")}>
        <div className={cn(
          "max-w-[75%] rounded-2xl p-3 border",
          isMine ? "bg-primary/10 border-primary/30 rounded-tr-sm" : "bg-blue-500/10 border-blue-500/30 rounded-tl-sm"
        )}>
          <p className="text-sm font-medium mb-2">📹 Panggilan video dimulai</p>
          <a
            href={meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
          >
            Join Call
          </a>
        </div>
      </div>
    );
  }

  // Group reactions by emoji
  const reactionsByEmoji: Record<string, { users: string[]; mine: boolean }> = {};
  (msg.chat_reactions || []).forEach((r) => {
    if (!reactionsByEmoji[r.emoji]) reactionsByEmoji[r.emoji] = { users: [], mine: false };
    reactionsByEmoji[r.emoji].users.push(r.user_id);
    if (r.user_id === currentUserId) reactionsByEmoji[r.emoji].mine = true;
  });

  const initials = initialsOf(msg.profiles?.full_name);

  return (
    <div
      id={`msg-${msg.id}`}
      className={cn(
        "group relative flex items-end gap-2 my-0.5 px-2 transition-colors",
        isMine ? "justify-end" : "justify-start",
        isGrouped ? "mt-0.5" : "mt-2"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactionPicker(false); }}
    >
      {/* Avatar (hanya pesan orang lain, pesan pertama grup) */}
      {!isMine && (
        <div className="flex-shrink-0 w-8 h-8">
          {!isGrouped && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-[10px] font-bold text-primary overflow-hidden">
              {msg.profiles?.avatar_url ? (
                <img src={msg.profiles.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                initials
              )}
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div className={cn("relative max-w-[70%] md:max-w-[60%]", showActions && "z-10")}>
        {/* Hover actions */}
        {showActions && !msg.deleted_at && (
          <div className={cn(
            "absolute top-0 flex items-center gap-0.5 bg-popover border rounded-full shadow-md p-0.5 z-20",
            isMine ? "right-full mr-1" : "left-full ml-1"
          )}>
            {showReactionPicker && (
              <ReactionPicker
                onReact={(emoji) => onReact(msg.id, emoji)}
                onClose={() => setShowReactionPicker(false)}
              />
            )}
            <button
              onClick={() => setShowReactionPicker((s) => !s)}
              className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-full text-sm"
              title="React"
            >
              😀
            </button>
            <button
              onClick={() => onReply(msg)}
              className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-full text-sm"
              title="Reply"
            >
              ↩
            </button>
            {isMine && (
              <>
                <button
                  onClick={() => onEdit(msg)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-full text-sm"
                  title="Edit"
                >
                  ✏
                </button>
                <button
                  onClick={() => onDelete(msg.id)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-destructive/10 rounded-full text-sm"
                  title="Delete"
                >
                  🗑
                </button>
              </>
            )}
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-3 py-1.5 shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-150",
            isMine
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm",
            isGrouped && (isMine ? "rounded-tr-2xl" : "rounded-tl-2xl"),
            highlight && "ring-2 ring-yellow-400 ring-offset-1"
          )}
        >
          {/* Nama pengirim (hanya pesan orang lain di grup chat) */}
          {!isMine && showName && (
            <p className={cn("text-xs font-bold mb-0.5", nameColor(msg.user_id))}>
              {msg.profiles?.full_name || "Unknown"}
            </p>
          )}

          {/* Reply preview */}
          {replyToMsg && (
            <button
              onClick={() => onJumpTo(replyToMsg.id)}
              className={cn(
                "block w-full text-left text-xs mb-1 px-2 py-1 rounded-md border-l-2 truncate",
                isMine
                  ? "bg-primary-foreground/15 border-primary-foreground/50 text-primary-foreground/90"
                  : "bg-background/60 border-primary text-muted-foreground"
              )}
            >
              <span className="font-semibold block truncate">
                ↩ {replyToMsg.profiles?.full_name || "Pesan"}
              </span>
              <span className="block truncate opacity-80">
                {replyToMsg.content.slice(0, 80)}
              </span>
            </button>
          )}

          {/* Content */}
          {msg.deleted_at ? (
            <p className={cn("text-sm italic opacity-70", isMine && "text-primary-foreground/80")}>
              🗑️ Pesan ini telah dihapus
            </p>
          ) : (
            <div className={cn(
              "text-sm break-words",
              isMine ? "prose prose-sm prose-invert max-w-none prose-p:my-0 prose-pre:my-1" : "prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-pre:my-1"
            )}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )}

          {/* Timestamp + edited — dalam bubble */}
          <div className={cn(
            "flex items-center justify-end gap-1 text-[10px] mt-0.5",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {isEdited && <span className="italic">diedit</span>}
            <span>{timeStr}</span>
            {isMine && <span className="text-primary-foreground/90">✓</span>}
          </div>

          {/* Reactions — nempel di bawah bubble */}
          {!msg.deleted_at && Object.keys(reactionsByEmoji).length > 0 && (
            <div className="flex flex-wrap gap-1 -mb-1.5 mt-1">
              {Object.entries(reactionsByEmoji).map(([emoji, info]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(msg.id, emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border shadow-sm transition-colors",
                    isMine
                      ? info.mine
                        ? "bg-primary-foreground/25 border-primary-foreground/50 text-primary-foreground"
                        : "bg-background border-border text-foreground"
                      : info.mine
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-background border-border text-foreground"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-semibold">{info.users.length}</span>
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
// Jitsi Call Panel
// ============================
function CallPanel({
  room,
  displayName,
  onLeave,
  onMinimize,
  minimized,
}: {
  room: string;
  displayName: string;
  onLeave: () => void;
  onMinimize: () => void;
  minimized: boolean;
}) {
  const jitsiUrl = `https://meet.jit.si/${room}#config.prejoinPageEnabled=false&config.startWithVideoMuted=true&config.startWithAudioMuted=false&userInfo.displayName=${encodeURIComponent(displayName)}&config.disableDeepLinking=true`;

  if (minimized) {
    return (
      <div className="absolute bottom-20 right-4 z-30 flex items-center gap-2 bg-popover border rounded-full shadow-lg pl-4 pr-2 py-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-medium">Call berlangsung</span>
        <button onClick={onMinimize} className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded-full text-sm" title="Buka">
          ⤢
        </button>
        <button onClick={onLeave} className="w-7 h-7 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full text-sm" title="Keluar">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="border-l bg-card flex flex-col w-full md:w-[420px] lg:w-[520px] flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-red-500/5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-semibold">Group Call</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">mic otomatis aktif, kamera off</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMinimize} className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-sm" title="Minimize (tetap chat)">
            ▭
          </button>
          <button onClick={onLeave} className="w-8 h-8 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm" title="Keluar call">
            ✕
          </button>
        </div>
      </div>
      <iframe
        src={jitsiUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        className="flex-1 w-full h-full min-h-[300px] border-0"
        style={{ height: "100%" }}
      />
    </div>
  );
}

// ============================
// Member Panel (kanan)
// ============================
function MemberPanel({
  channelId,
  myUserId,
  isOwner,
  onClose,
  onInvite,
}: {
  channelId: string;
  myUserId: string;
  isOwner: boolean;
  onClose: () => void;
  onInvite: () => void;
}) {
  const [members, setMembers] = useState<{
    user_id: string;
    role: string;
    profile: { full_name: string; avatar_url: string | null; role: string; division?: string };
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/members?channelId=${channelId}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [channelId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleKick = async (userId: string, name: string) => {
    if (!confirm(`Keluarkan ${name} dari grup?`)) return;
    const res = await fetch(`/api/chat/members?channelId=${channelId}&userId=${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${name} dikeluarkan`);
      loadMembers();
    } else {
      toast.error("Gagal mengeluarkan member");
    }
  };

  const panelContent = (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Anggota ({members.length})
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      {isOwner && (
        <button
          onClick={onInvite}
          className="mb-3 w-full text-xs font-medium border-dashed border-primary/40 text-primary hover:bg-primary/5 rounded-lg py-1.5"
        >
          ＋ Invite anggota
        </button>
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Memuat...</p>
      ) : (
        <div className="flex flex-col gap-1">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted group">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary overflow-hidden flex-shrink-0">
                {m.profile?.avatar_url ? (
                  <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  initialsOf(m.profile?.full_name).charAt(0)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {m.profile?.full_name || "Unknown"}
                  {m.user_id === myUserId && <span className="text-muted-foreground"> (kamu)</span>}
                </p>
                {m.role === "owner" && (
                  <span className="text-[10px] text-amber-600 font-medium">👑 Owner</span>
                )}
              </div>
              {isOwner && m.user_id !== myUserId && m.role !== "owner" && (
                <button
                  onClick={() => handleKick(m.user_id, m.profile?.full_name || "member")}
                  className="opacity-0 group-hover:opacity-100 text-destructive/60 hover:text-destructive text-xs"
                  title="Keluarkan"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop (>=lg): inline panel kanan */}
      <div className="hidden lg:flex w-60 flex-shrink-0 border-l bg-muted/30 p-3 overflow-y-auto flex-col">
        {panelContent}
      </div>
      {/* Mobile/tablet (<lg): slide-over drawer dari kanan */}
      <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-background border-l shadow-xl p-3 overflow-y-auto flex flex-col">
          {panelContent}
        </div>
      </div>
    </>
  );
}

// ============================
// Chat Area
// ============================
function ChatArea({
  channelId,
  channelName,
  channelType,
  channelIsPrivate,
  isGroupOwner,
  currentUserId,
  currentUserName,
  activeCall,
  onStartCall,
  onJoinCall,
  onEndCall,
  onInvite,
  onLeaveGroup,
  onOpenChannels,
}: {
  channelId: string;
  channelName: string;
  channelType: string;
  channelIsPrivate: boolean;
  isGroupOwner: boolean;
  currentUserId: string;
  currentUserName: string;
  activeCall: ActiveCall | null;
  onStartCall: () => void;
  onJoinCall: () => void;
  onEndCall: () => void;
  onInvite: () => void;
  onLeaveGroup: () => void;
  onOpenChannels?: () => void;
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
  const [showMembers, setShowMembers] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

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

  // Jump to replied message + highlight
  const handleJumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 2000);
    }
  }, []);

  // Message map untuk reply preview
  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Grouping: tanggal + consecutive same author
  const renderMessages = () => {
    const items: React.ReactNode[] = [];
    let prevMsg: ChatMessage | null = null;

    messages.forEach((msg) => {
      // Date separator jika beda hari
      if (!prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()) {
        items.push(<DateSeparator key={`d-${msg.id}`} date={msg.created_at} />);
      }

      const isMine = msg.user_id === currentUserId;
      const isGrouped =
        !!prevMsg &&
        prevMsg.user_id === msg.user_id &&
        msg.message_type !== "system" &&
        prevMsg.message_type !== "system" &&
        new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000;

      const replyToMsg = msg.reply_to ? messagesById.get(msg.reply_to) || null : null;

      items.push(
        <MessageBubble
          key={msg.id}
          msg={msg}
          isMine={isMine}
          isGrouped={isGrouped}
          showName={!isGrouped}
          replyToMsg={replyToMsg}
          currentUserId={currentUserId}
          highlight={highlightId === msg.id}
          onReply={setReplyTo}
          onReact={handleReact}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onJumpTo={handleJumpTo}
        />
      );

      prevMsg = msg;
    });

    return items;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (editingMsg) {
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
        const body: Record<string, unknown> = {
          channel_id: channelId,
          content: text,
        };
        if (replyTo) body.reply_to = replyTo.id;
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
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      broadcastTyping(currentUserName, currentUserId);
    }, 300);
  };

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

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await fetch(`/api/chat/messages?messageId=${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error("Gagal menghapus pesan");
    }
  };

  const handleEdit = (msg: ChatMessage) => {
    setEditingMsg(msg);
    setInput(msg.content);
    textareaRef.current?.focus();
  };

  const typingArray = Array.from(typingUsers.values()).filter((t) => t.user_id !== currentUserId);
  const typingText =
    typingArray.length === 0
      ? ""
      : typingArray.length === 1
      ? `${typingArray[0].user_name} sedang mengetik...`
      : `${typingArray.length} orang sedang mengetik...`;

  const onlineCount = onlineUsers.size;
  const isGroup = channelType === "group";
  const hasLiveCall = !!activeCall;

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Channel Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onOpenChannels && (
              <button
                onClick={onOpenChannels}
                className="md:hidden w-8 h-8 -ml-1 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-muted text-base"
                title="Daftar channel"
                aria-label="Buka daftar channel"
              >
                ☰
              </button>
            )}
            <span className="text-lg flex-shrink-0">
              {isGroup ? "👥" : channelType === "dm" ? "💬" : channelType === "announcement" ? "📢" : "#"}
            </span>
            <h2 className="font-semibold truncate">{channelName}</h2>
            {isGroup && channelIsPrivate && (
              <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 flex-shrink-0">🔒</span>
            )}
            {onlineCount > 0 && (
              <span className="flex-shrink-0 flex items-center gap-1 text-xs text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {onlineCount} online
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isGroup && (
              <button
                onClick={() => setShowMembers((s) => !s)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted text-sm"
                title="Anggota grup"
              >
                👥
              </button>
            )}
            {!hasLiveCall ? (
              <button
                onClick={onStartCall}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                📹 <span className="hidden sm:inline">Call</span>
              </button>
            ) : (
              <button
                onClick={onJoinCall}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors animate-pulse"
              >
                ● <span className="hidden sm:inline">Join Call</span>
              </button>
            )}
          </div>
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
          className="flex-1 overflow-y-auto py-4 relative"
        >
          {loadingOlder && (
            <div className="text-center text-xs text-muted-foreground py-2">Memuat pesan lama...</div>
          )}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <span className="text-4xl">💬</span>
              <p className="text-sm">Belum ada pesan. Mulai percakapan pertama!</p>
            </div>
          ) : (
            renderMessages()
          )}
          <div ref={messagesEndRef} />

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
          <div className="px-4 py-1.5 border-t bg-muted/30 flex items-center justify-between text-xs gap-2">
            <span className="text-muted-foreground truncate flex items-center gap-1">
              {editingMsg ? (
                <>✏ <span>Mengedit pesan</span></>
              ) : (
                <>
                  ↩ <span className="font-semibold">{replyTo?.profiles?.full_name || "pesan"}:</span>
                  <span className="truncate opacity-70">{replyTo?.content.slice(0, 60)}</span>
                </>
              )}
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
        <div className="border-t p-3 md:p-4 bg-background">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Pesan ke ${isGroup || channelType === "dm" ? "" : "#"}${channelName}...`}
                rows={1}
                className="w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Kirim pesan"
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
          <p className="text-[11px] text-muted-foreground mt-1.5 text-center hidden sm:block">
            Enter kirim · Shift+Enter baris baru · Esc batal · Markdown didukung
          </p>
          {isGroup && !isGroupOwner && (
            <button
              onClick={onLeaveGroup}
              className="text-[11px] text-destructive/70 hover:text-destructive mt-1"
            >
              Keluar dari grup
            </button>
          )}
        </div>
      </div>

      {/* Member panel (desktop) */}
      {isGroup && showMembers && (
        <MemberPanel
          channelId={channelId}
          myUserId={currentUserId}
          isOwner={isGroupOwner}
          onClose={() => setShowMembers(false)}
          onInvite={onInvite}
        />
      )}
    </div>
  );
}

// ============================
// Create Group Modal
// ============================
function CreateGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, memberIds: string[], isPrivate: boolean) => Promise<void>;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => setUsers(data.team || data.members || data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) && !u.is_me
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), Array.from(selected), isPrivate);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">Buat Grup Baru</h3>
            <p className="text-xs text-muted-foreground">Chat & group call ala Discord/WhatsApp</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nama grup</label>
            <input
              type="text"
              placeholder="cth: Tim Marketing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mt-1"
              autoFocus
              maxLength={60}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-private"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="is-private" className="text-sm text-muted-foreground">
              🔒 Private (hanya anggota yang diajak yang bisa lihat)
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Pilih anggota {selected.size > 0 && `(${selected.size} dipilih)`}
            </label>
            <input
              type="text"
              placeholder="Cari nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mt-1 mb-2"
            />
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Memuat...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Tidak ada user ditemukan</p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors",
                      selected.has(u.id) ? "bg-primary/15 text-primary" : "hover:bg-muted"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(u.full_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate">{u.full_name}</span>
                    <span className="text-xs text-muted-foreground">{u.role?.replace(/_/g, " ")}</span>
                    {selected.has(u.id) && <span className="text-primary font-bold">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-muted">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || creating}
            className="flex-[2] px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40"
          >
            {creating ? "Membuat..." : selected.size > 0 ? `Buat Grup + ${selected.size} anggota` : "Buat Grup"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================
// Invite Member Modal
// ============================
function InviteMemberModal({
  channelId,
  existingMemberIds,
  onClose,
  onInvited,
}: {
  channelId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => setUsers((data.team || data.members || data.users || []).filter((u: UserProfile) => !u.is_me)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) &&
      !existingMemberIds.includes(u.id)
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0 || inviting) return;
    setInviting(true);
    try {
      const res = await fetch("/api/chat/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, user_ids: Array.from(selected), action: "invite" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal invite");
      }
      toast.success(`${selected.size} anggota ditambahkan ke grup`);
      onInvited();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal invite");
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Invite Anggota ke Grup</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
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
            <p className="text-sm text-muted-foreground text-center py-4">Semua user sudah jadi anggota</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left",
                    selected.has(u.id) ? "bg-primary/15 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(u.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{u.full_name}</span>
                  {selected.has(u.id) && <span className="font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-muted">Batal</button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || inviting}
            className="flex-1 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40"
          >
            {inviting ? "Menginvite..." : `Invite (${selected.size})`}
          </button>
        </div>
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
      .then((data) => setUsers(data.team || data.members || data.users || []))
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
                  <span className="text-xs text-muted-foreground">{u.role?.replace(/_/g, " ")}</span>
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
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [inCallRoom, setInCallRoom] = useState<string | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);

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

  // Load current user — robust multi-fallback:
  // 1) `me` object dari /api/team, 2) flag is_me di daftar team, 3) auth.getUser()
  useEffect(() => {
    let cancelled = false;

    const fallbackToAuth = async (): Promise<UserProfile | null> => {
      try {
        const { data } = await createClient().auth.getUser();
        if (!data.user) return null;
        return {
          id: data.user.id,
          full_name:
            (data.user.user_metadata?.full_name as string) ||
            data.user.email ||
            "Saya",
          avatar_url: null,
          role: "user",
          is_me: true,
        };
      } catch {
        return null;
      }
    };

    (async () => {
      let me: UserProfile | null = null;
      try {
        const res = await fetch("/api/team");
        if (res.ok) {
          const data = await res.json();
          if (data.me) {
            me = data.me;
          } else {
            const list: UserProfile[] = data.team || data.members || data.users || [];
            me = list.find((u) => u.is_me) || null;
            if (!me) {
              const authMe = await fallbackToAuth();
              if (authMe) me = list.find((u) => u.id === authMe.id) || authMe;
            }
          }
        }
      } catch {
        // ignore — coba fallback auth
      }
      if (!me) me = await fallbackToAuth();
      if (!cancelled && me) setCurrentUser(me);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Poll active calls tiap 10 detik (badge LIVE)
  const loadCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/calls");
      if (res.ok) {
        const data = await res.json();
        setActiveCalls(data.calls || []);
        // Auto-exit call room jika call sudah berakhir
        setInCallRoom((room) => {
          if (!room) return room;
          const stillActive = (data.calls || []).some((c: ActiveCall) => c.jitsi_room === room);
          return stillActive ? room : null;
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadCalls();
    const interval = setInterval(loadCalls, 10000);
    return () => clearInterval(interval);
  }, [loadCalls]);

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
  const channelActiveCall = activeCalls.find((c) => c.channel_id === activeChannelId) || null;
  const isGroupOwner = !!activeChannel && activeChannel.type === "group" && activeChannel.is_owner;

  // Start group call (Jitsi embed — tidak buka tab baru)
  const handleStartCall = async () => {
    if (!activeChannelId) return;
    try {
      const res = await fetch("/api/chat/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: activeChannelId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal memulai call");
      }
      const data = await res.json();
      setInCallRoom(data.call.jitsi_room);
      setCallMinimized(false);
      loadCalls();
      toast.success("Group call dimulai! Tim bisa join dari badge 🔴 LIVE");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai call");
    }
  };

  const handleJoinCall = () => {
    if (channelActiveCall) {
      setInCallRoom(channelActiveCall.jitsi_room);
      setCallMinimized(false);
    }
  };

  const handleLeaveCall = async () => {
    // Jika saya yang mulai call & call masih aktif, akhiri untuk semua
    const myCall = activeCalls.find(
      (c) => c.jitsi_room === inCallRoom && c.started_by === currentUser?.id
    );
    if (myCall) {
      await fetch("/api/chat/calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: myCall.id, channel_id: myCall.channel_id }),
      }).catch(() => {});
      loadCalls();
    }
    setInCallRoom(null);
    setCallMinimized(false);
  };

  // Create group
  const handleCreateGroup = async (name: string, memberIds: string[], isPrivate: boolean) => {
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "group", name, member_ids: memberIds, is_private: isPrivate }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal membuat grup");
      }
      const data = await res.json();
      toast.success(`Grup "${name}" dibuat 🎉`);
      setShowGroupModal(false);
      await loadChannels();
      if (data.channel) setActiveChannelId(data.channel.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat grup");
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

  // Leave group
  const handleLeaveGroup = async () => {
    if (!activeChannel) return;
    if (!confirm(`Keluar dari grup ${activeChannel.name}?`)) return;
    const res = await fetch(`/api/chat/members?channelId=${activeChannel.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Kamu keluar dari grup");
      setActiveChannelId(null);
      loadChannels();
    } else {
      toast.error("Gagal keluar dari grup");
    }
  };

  return (
    <>
      <PageHeader title="Team Chat" />
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        Chat internal tim — grup, DM, group call, real-time
      </p>

      <div className="relative flex h-[calc(100vh-180px)] rounded-xl border bg-card overflow-hidden">
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
              activeCalls={activeCalls}
              onSelect={setActiveChannelId}
              onNewDM={() => setShowDMModal(true)}
              onNewGroup={() => setShowGroupModal(true)}
            />
          )}
        </div>

        {/* Center: Chat Area + Call Panel */}
        <div className="flex flex-1 min-w-0 relative">
          {activeChannel ? (
            <>
              <div className={cn("flex-1 min-w-0", inCallRoom && !callMinimized && "hidden md:flex")}>
                <ChatArea
                  channelId={activeChannel.id}
                  channelName={activeChannel.type === "dm" ? activeChannel.name.replace(/__/g, " · ") : activeChannel.name}
                  channelType={activeChannel.type}
                  channelIsPrivate={!!activeChannel.is_private}
                  isGroupOwner={!!isGroupOwner}
                  currentUserId={currentUser?.id || ""}
                  currentUserName={currentUser?.full_name || "User"}
                  activeCall={channelActiveCall}
                  onStartCall={handleStartCall}
                  onJoinCall={handleJoinCall}
                  onEndCall={handleLeaveCall}
                  onInvite={() => setShowInviteModal(true)}
                  onLeaveGroup={handleLeaveGroup}
                  onOpenChannels={() => setShowChannelDrawer(true)}
                />
              </div>
              {inCallRoom && (
                <CallPanel
                  room={inCallRoom}
                  displayName={currentUser?.full_name || "User"}
                  onLeave={handleLeaveCall}
                  onMinimize={() => setCallMinimized((s) => !s)}
                  minimized={callMinimized}
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full w-full text-muted-foreground">
              Pilih channel atau grup untuk mulai chat
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Channel drawer (slide-in dari kiri, dibuka via tombol ☰ di header chat) */}
      {showChannelDrawer && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowChannelDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-background border-r shadow-xl p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-3 px-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
              <button
                onClick={() => setShowChannelDrawer(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
                aria-label="Tutup daftar channel"
              >
                ✕
              </button>
            </div>
            {loadingChannels ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <ChannelSidebar
                channels={channels}
                activeChannelId={activeChannelId}
                activeCalls={activeCalls}
                onSelect={(id) => {
                  setActiveChannelId(id);
                  setShowChannelDrawer(false);
                }}
                onNewDM={() => {
                  setShowDMModal(true);
                  setShowChannelDrawer(false);
                }}
                onNewGroup={() => {
                  setShowGroupModal(true);
                  setShowChannelDrawer(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showDMModal && (
        <NewDMModal onClose={() => setShowDMModal(false)} onPick={handleCreateDM} />
      )}
      {showGroupModal && (
        <CreateGroupModal onClose={() => setShowGroupModal(false)} onCreate={handleCreateGroup} />
      )}
      {showInviteModal && activeChannel && (
        <InviteMemberModal
          channelId={activeChannel.id}
          existingMemberIds={(activeChannel.members || []).map((m) => m.user_id)}
          onClose={() => setShowInviteModal(false)}
          onInvited={loadChannels}
        />
      )}
    </>
  );
}