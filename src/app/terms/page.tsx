import { ArrowLeft } from 'lucide-react';
export const metadata = {
  title: "Syarat & Ketentuan — Hadona Workspace",
  description: "Syarat dan ketentuan penggunaan aplikasi Hadona Workspace.",
};

const sections = [
  {
    title: "1. Penerimaan Ketentuan",
    body: [
      "Dengan mengakses dan menggunakan Hadona Workspace (workspace.hadona.id), Anda menyetujui untuk terikat pada Syarat & Ketentuan ini. Jika Anda tidak menyetujui ketentuan ini, mohon hentikan penggunaan Aplikasi.",
      "Aplikasi ini dikelola oleh HDN Advertising dan ditujukan untuk penggunaan internal tim serta klien yang terdaftar.",
    ],
  },
  {
    title: "2. Akun & Keanggotaan",
    body: [
      "Akun dibuat melalui undangan atau pendaftaran yang disetujui administrator. Setiap pengguna bertanggung jawab menjaga kerahasiaan kredensial akunnya (termasuk autentikasi dua faktor bila aktif).",
      "Administrator berhak menonaktifkan akun yang melanggar ketentuan atau tidak lagi terkait dengan organisasi.",
    ],
  },
  {
    title: "3. Penggunaan yang Diperkenankan",
    body: [
      "Anda setuju menggunakan Aplikasi hanya untuk keperluan pekerjaan yang sah: manajemen tugas, penjadwalan rapat, pengelolaan konten, pelaporan iklan, dan administrasi klien.",
      "Dilarang: mencoba mengakses data pengguna lain tanpa izin, melakukan rekayasa balik, memuat malware, atau mengganggu ketersediaan layanan.",
    ],
  },
  {
    title: "4. Integrasi Pihak Ketiga",
    body: [
      "Aplikasi dapat terhubung ke layanan Google (Calendar, Meet, Drive), Meta Ads, dan layanan lainnya. Penggunaan layanan tersebut tetap tunduk pada syarat masing-masing penyedia.",
      "Anda bertanggung jawab atas izin akses yang Anda berikan dan dapat mencabutnya kapan saja.",
    ],
  },
  {
    title: "5. Kepemilikan Data",
    body: [
      "Data yang Anda masukkan tetap menjadi milik Anda dan/atau klien terkait. HDN Advertising bertindak sebagai pengolah data semata untuk keperluan pengoperasian Aplikasi.",
    ],
  },
  {
    title: "6. Batasan Tanggung Jawab",
    body: [
      "Aplikasi disediakan \"sebagaimana adanya\". Kami tidak menjamin layanan bebas gangguan tanpa henti, dan tidak bertanggung jawab atas kerugian tidak langsung akibat gangguan layanan, kehilangan data, atau kesalahan input pengguna.",
    ],
  },
  {
    title: "7. Perubahan Ketentuan",
    body: [
      "Kami dapat memperbarui ketentuan ini dari waktu ke waktu. Perubahan signifikan akan diberitahukan kepada pengguna. Versi terbaru selalu tersedia di halaman ini.",
    ],
  },
  {
    title: "8. Kontak",
    body: [
      "Pertanyaan mengenai ketentuan ini dapat dikirim ke: info@hadona.id",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} className="inline" /> Kembali ke Hadona Workspace
        </a>
        <h1 className="mb-2 text-3xl font-bold">Syarat & Ketentuan</h1>
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