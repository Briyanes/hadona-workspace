"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * RichText — render teks plain dengan format ringan ala markdown sosmed:
 * - **bold** → <strong>
 * - *italic* → <em>
 * - - item / • item → bullet list
 * - URL (http/https/www) → link klik-able (tab baru)
 *
 * Aman XSS: semua dirender sebagai React nodes, tanpa dangerouslySetInnerHTML.
 */

const URL_RE = /(https?:\/\/[^\s<>()"']+|www\.[^\s<>()"']+)/gi;

/** Render satu segmen teks: bold/italic markdown-lite (rekursif sederhana). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Token: **bold**, *italic*
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`} className="italic">{m[3]}</em>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render segmen yang mengandung URL → pecah jadi teks + <a>. */
function renderWithLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  URL_RE.lastIndex = 0;

  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(...renderInline(text.slice(last, m.index), `${keyPrefix}-t${i}`));
    const raw = m[0];
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    nodes.push(
      <a
        key={`${keyPrefix}-a${i}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
      >
        {raw}
      </a>
    );
    last = m.index + raw.length;
    i++;
  }
  if (last < text.length) nodes.push(...renderInline(text.slice(last), `${keyPrefix}-t${i}`));
  return nodes;
}

interface RichTextProps {
  text?: string | null;
  className?: string;
}

export function RichText({ text, className }: RichTextProps) {
  if (!text) return null;

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`ul-${key}`} className="ml-4 list-disc space-y-0.5">
        {bullets.map((b, bi) => (
          <li key={`${key}-${bi}`}>{renderWithLinks(b, `${key}-li${bi}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
    } else {
      flushBullets(String(idx));
      if (line.trim() === "") {
        nodes.push(<div key={`sp-${idx}`} className="h-1.5" />);
      } else {
        nodes.push(<p key={`p-${idx}`}>{renderWithLinks(line, `l${idx}`)}</p>);
      }
    }
  });
  flushBullets("end");

  return <div className={cn("space-y-1", className)}>{nodes}</div>;
}