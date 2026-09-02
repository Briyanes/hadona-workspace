'use client';

import {
  Banknote,
  BarChart3,
  Clapperboard,
  ClipboardList,
  Eye,
  Globe,
  Heart,
  Inbox,
  Laptop,
  MessageCircle,
  Play,
  Radio,
  Rocket,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Target,
  TrendingUp,
  TrafficCone,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Central mapping objective id → Lucide icon.
 * Menggantikan field `icon` (emoji string) di ad-objectives.ts untuk render UI.
 * Emoji tetap disimpan di data untuk keperluan non-UI (export, dsb).
 */
const OBJECTIVE_ICONS: Record<string, LucideIcon> = {
  // Meta
  META_CPAS: ShoppingCart,
  META_CTWA: MessageCircle,
  META_CTLP: Globe,
  META_TRAFFIC: TrafficCone,
  META_SALES: Banknote,
  META_LEAD_GEN: ClipboardList,
  META_AWARENESS: Eye,
  META_MESSAGES: Inbox,
  META_ENGAGEMENT: Heart,
  META_VIDEO_VIEWS: Clapperboard,
  META_APP_INSTALLS: Smartphone,
  // Google
  GOOGLE_GDN: BarChart3,
  GOOGLE_DEMAND_GEN: Zap,
  GOOGLE_SEARCH: Search,
  GOOGLE_PMAX: Rocket,
  GOOGLE_YOUTUBE: Play,
  GOOGLE_SHOPPING: ShoppingBag,
  // TikTok
  TIKTOK_GMX_MAX: TrendingUp,
  TIKTOK_WEB_CONV: Laptop,
  TIKTOK_REACH: Radio,
  TIKTOK_VIDEO_VIEWS: Video,
  TIKTOK_COMMUNITY: Users,
};

export function ObjectiveIcon({
  id,
  size = 12,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = OBJECTIVE_ICONS[id] || Target;
  return <Icon size={size} className={className} aria-hidden="true" />;
}