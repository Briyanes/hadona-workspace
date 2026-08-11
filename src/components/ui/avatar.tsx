import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number; // pixel size
  className?: string;
  ring?: boolean;
  referrerPolicy?: "no-referrer" | "no-referrer-when-downgrade";
}

/**
 * Generate initials from a name (max 2 chars)
 */
function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate deterministic color from a string (for fallback background)
 */
function getColorFromName(name?: string | null): string {
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-green-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-purple-500",
    "bg-pink-500",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Avatar component with automatic fallback to colored initials.
 * Uses next/image for optimization when src is available.
 */
export function Avatar({
  src,
  name,
  size = 32,
  className,
  ring = false,
  referrerPolicy,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        ring && "ring-2 ring-border",
        className
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <Image
          src={src}
          alt={name || "Avatar"}
          fill
          sizes={`${size}px`}
          className="object-cover"
          referrerPolicy={referrerPolicy}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center text-white font-medium",
            getColorFromName(name)
          )}
          style={{ fontSize: size * 0.4 }}
          aria-label={name ? `Avatar for ${name}` : "Avatar"}
          role="img"
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}