"use client";

import { useState, useRef, useEffect } from "react";
import { useChatChannels, useChatRealtime, type ChatMessage } from "@/hooks/use-chat-realtime";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";

// ============================
// Channel Sidebar Component
// ============================
function ChannelSidebar({
  channels,
  activeChannelId,
  onSelect,
}: {
  channels: ReturnType<typeof useChatChannels>["channels"];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
}) {
  const generalChannels = channels.filter((c) => c.type === "general" || c.type === "announcement");
  const divisionChannels = channels.filter((c) => c.type === "division");
  const dmChannels = channels.filter((c) => c.type === "dm");

  const renderChannel = (ch: (typeof channels)[0]) => (
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
        {ch.type === "announcement" ? "📢" : ch.type === "division" ? "🏠" : "#"} {ch.name}
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
          {generalChannels.map(renderChannel)}
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
      {dmChannels.length > 0 && (
        <div>
          <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Direct Messages
          </p>
          <div className="flex flex-col gap-0.5">
            {dmChannels.map(renderChannel)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// Message Bubble Component
// ============================
function MessageBubble({
  msg,
  onDelete,
}: {
  msg: ChatMessage;
  onDelete: (id: string) => void;
}) {
  const initials = (msg.profiles?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const timeStr = format(new Date(msg.created_at), "HH:mm");
  const dateLabel = isToday(new Date(msg.created_at))
    ? "Hari ini"
    : isYesterday(new Date(msg.created_at))
    ? "Kemarin"
    : format(new Date(msg.created_at), "dd/MM/yyyy");

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
      <div className="flex gap-3 px-4 py-2 hover:bg-muted/50 rounded-lg transition-colors">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center">
          📹
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{msg.profiles?.full_name || "Unknown"}</span>
            <span className="text-xs text-muted-foreground">{dateLabel} {timeStr}</span>
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

  // Regular text message
  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-muted/30 rounded-lg transition-colors">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold text-primary">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{msg.profiles?.full_name || "Unknown"}</span>
          {msg.profiles?.role && (
            <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded">
              {msg.profiles.role}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{dateLabel} {timeStr}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">{msg.content}</p>
      </div>
      <button
        onClick={() => onDelete(msg.id)}
        className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive transition-opacity"
        title="Delete message"
      >
        🗑
      </button>
    </div>
  );
}

// ============================
// Chat Area Component
// ============================
function ChatArea({
  channelId,
  channelName,
  onStartCall,
}: {
  channelId: string;
  channelName: string;
  onStartCall: () => void;
}) {
  const { messages, loading, sendMessage, deleteMessage } = useChatRealtime(channelId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await sendMessage(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pesan");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Channel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">#</span>
          <h2 className="font-semibold">{channelName}</h2>
        </div>
        <button
          onClick={onStartCall}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          📹 Start Call
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Memuat pesan...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <span className="text-4xl">💬</span>
            <p className="text-sm">Belum ada pesan. Sapa tim pertama!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} onDelete={deleteMessage} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4 bg-background">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleInputResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Pesan ke #${channelName}...`}
              rows={1}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          Enter untuk kirim, Shift+Enter untuk baris baru
        </p>
      </div>
    </div>
  );
}

// ============================
// Main Chat Page
// ============================
export default function ChatPage() {
  const { channels, loading } = useChatChannels();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

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

      if (!meetLink) {
        throw new Error("Meet link tidak ditemukan");
      }

      // Post call link to channel
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

      // Open Meet in new tab
      window.open(meetLink, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat call");
    }
  };

  return (
    <>
      <PageHeader title="Team Chat" />
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        Chat internal tim dan video call dengan Google Meet
      </p>

      <div className="flex h-[calc(100vh-180px)] rounded-xl border bg-card overflow-hidden">
        {/* Left: Channel Sidebar */}
        <div className="w-64 flex-shrink-0 border-r bg-muted/30 p-3 overflow-y-auto hidden md:block">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Memuat...
            </div>
          ) : (
            <ChannelSidebar
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={setActiveChannelId}
            />
          )}
        </div>

        {/* Center: Chat Area */}
        <div className="flex-1 min-w-0">
          {activeChannel ? (
            <ChatArea
              channelId={activeChannel.id}
              channelName={activeChannel.name}
              onStartCall={handleStartCall}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Pilih channel untuk mulai chat
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Channel selector (bottom sheet style) */}
      <div className="md:hidden mt-4">
        <details className="rounded-lg border bg-card">
          <summary className="px-4 py-2 text-sm font-medium cursor-pointer">
            Pilih Channel {activeChannel && `· #${activeChannel.name}`}
          </summary>
          <div className="p-3 border-t">
            <ChannelSidebar
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={setActiveChannelId}
            />
          </div>
        </details>
      </div>
    </>
  );
}
