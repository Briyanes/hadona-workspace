/**
 * SOP Onboarding Client — template standar Hadona
 * Diambil dari "Timeline and Key Actions" sheet OKR client
 * (grup koordinasi → ad account → akses → strategi → produksi → run iklan)
 *
 * offset_days = hari relatif dari tanggal mulai (0 = hari ini)
 * pic_role = peran default (PM bisa re-assign ke user di /tasks)
 */

export interface SopTaskTemplate {
  title: string;
  start_offset: number; // hari
  end_offset: number; // hari
  pic_role: string; // nama PIC default dari sheet
  division: string; // division task
}

export const SOP_ONBOARDING_ADS: SopTaskTemplate[] = [
  {
    title: "Membuat grup koordinasi antara Hadona dan Client",
    start_offset: 0,
    end_offset: 0,
    pic_role: "Devi",
    division: "account-management",
  },
  {
    title: "Membuat ad account",
    start_offset: 0,
    end_offset: 0,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Invite advertiser ke fanpage client",
    start_offset: 0,
    end_offset: 0,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Meminta akses instagram",
    start_offset: 0,
    end_offset: 0,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Meminta asset creative",
    start_offset: 0,
    end_offset: 0,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Membuat strategi ads",
    start_offset: 1,
    end_offset: 1,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Menentukan angle iklan",
    start_offset: 1,
    end_offset: 1,
    pic_role: "Afkaar",
    division: "ads",
  },
  {
    title: "Membuat ad creative brief",
    start_offset: 1,
    end_offset: 2,
    pic_role: "Ovi",
    division: "creative",
  },
  {
    title: "Membuat content plan + content brief social media",
    start_offset: 2,
    end_offset: 2,
    pic_role: "Ovi",
    division: "creative",
  },
  {
    title: "Memproduksi ad creative",
    start_offset: 3,
    end_offset: 5,
    pic_role: "Ovi",
    division: "creative",
  },
  {
    title: "Menjalankan iklan sesuai SOP",
    start_offset: 5,
    end_offset: 5,
    pic_role: "Yoga",
    division: "ads",
  },
  {
    title: "Start produksi content social media Week 1",
    start_offset: 5,
    end_offset: 5,
    pic_role: "Ovi",
    division: "creative",
  },
  {
    title: "Eval ads & konten week 1",
    start_offset: 12,
    end_offset: 12,
    pic_role: "Afkaar",
    division: "ads",
  },
];

export function sopTasksToPayload(
  clientName: string
): Array<{
  title: string;
  description: string;
  start_date: string;
  due_date: string;
  division: string;
  priority: string;
}> {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return SOP_ONBOARDING_ADS.map((t) => {
    const start = new Date(today);
    start.setDate(start.getDate() + t.start_offset);
    const end = new Date(today);
    end.setDate(end.getDate() + t.end_offset);
    return {
      title: t.title,
      description: `SOP onboarding client ${clientName}. Default PIC: ${t.pic_role} (silakan assign ulang).`,
      start_date: fmt(start),
      due_date: fmt(end),
      division: t.division,
      priority: t.end_offset <= 1 ? "high" : "medium",
    };
  });
}