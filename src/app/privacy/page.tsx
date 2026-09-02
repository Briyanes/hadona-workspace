import { ArrowLeft } from 'lucide-react';
export const metadata = {
  title: "Kebijakan Privasi — Hadona Workspace",
  description: "Kebijakan privasi penggunaan aplikasi Hadona Workspace.",
};

const sections = [
  {
    title: "1. Pendahuluan",
    body: [
      "Hadona Workspace (\"Kami\") adalah platform manajemen kerja internal yang dioperasikan oleh HDN Advertising. Kebijakan Privasi ini menjelaskan bagaimana Kami mengumpulkan, menggunakan, menyimpan, dan melindungi data Anda saat menggunakan aplikasi workspace.hadona.id (\"Aplikasi\").",
    ],
  },
  {
    title: "2. Data yang Kami Kumpulkan",
    body: [
      "Data akun: nama lengkap, alamat email, foto profil, dan divisi/role Anda di organisasi.",
      "Data integrasi Google: apabila Anda menghubungkan akun Google, Kami menyimpan token akses dan token refresh (terenkripsi di database) untuk membaca kalender serta membuat rapat Google Meet dan mengunggah berkas ke Google Drive sesuai izin yang Anda berikan.",
      "Data pekerjaan: tugas, komentar, laporan kinerja iklan, rencana konten, faktur, dan aktivitas lain yang Anda masukkan di dalam Aplikasi.",
      "Data teknis: alamat IP, jenis perangkat, dan log aktivitas untuk keamanan sistem.",
    ],
  },
  {
    title: "3. Penggunaan Data",
    body: [
      "Data digunakan semata-mata untuk menjalankan fitur Aplikasi: autentikasi, penjadwalan rapat, sinkronisasi konten, pelaporan, dan administrasi tim.",
      "Kami tidak menjual, menyewakan, atau memperdagangkan data Anda kepada pihak ketiga.",
    ],
  },
  {
    title: "4. Layanan Pihak Ketiga",
    body: [
      "Google (OAuth, Calendar, Meet, Drive) — autentikasi dan integrasi produktivitas.",
      "Supabase (database & autentikasi), Vercel (hosting), Cloudflare R2 (penyimpanan berkas), dan Meta Platforms (API iklan).",
      "Masing-masing layanan tunduk pada kebijakan privasinya sendiri.",
    ],
  },
  {
    title: "5. Penyimpanan & Keamanan",
    body: [
      "Data disimpan pada infrastruktur Supabase dengan kebijakan akses berbasis role (RLS). Akses ke data dibatasi hanya untuk anggota tim yang berkepentingan.",
      "Token OAuth disimpan di server dan tidak dibagikan ke pihak lain.",
    ],
  },
  {
    title: "6. Hak Anda",
    body: [
      "Anda berhak meminta akses, koreksi, atau penghapusan data pribadi Anda, serta mencabut izin integrasi Google kapan saja melalui halaman pengaturan Aplikasi atau akun Google Anda.",
      "Permintaan dapat diajukan ke kontak pada bagian 8 di bawah.",
    ],
  },
  {
    title: "7. Perubahan Kebijakan",
    body: [
      "Kami dapat memperbarui kebijakan ini sewaktu-waktu. Versi terbaru selalu tersedia di halaman ini.",
    ],
  },
  {
    title: "8. Kontak",
    body: [
      "Pertanyaan seputar privasi dapat dikirim ke: info@hadona.id",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} className="inline" /> Kembali ke Hadona Workspace
        </a>
        <h1 className="mb-2 text-3xl font-bold">Kebijakan Privasi</h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Terakhir diperbarui: 1 September 2026
        </p>
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="mb-3 text-lg font-semibold">{s.title}</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}