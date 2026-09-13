/**
 * client-slug.ts — util slug client yang aman dari duplikat.
 *
 * Insiden 9 Nov 2026: toast "Gagal menyimpan: duplicate key value violates
 * unique constraint clients_slug_key" di menu Strategy & OKR (wizard Client
 * Baru), halaman Clients, dan modal Invoice.
 *
 * Root cause: slug dihitung client-side dari nama TANPA cek duplikat, dan
 * trigger DB v62 tidak menjamin keunikan. Fix berlapis:
 *   - DB (migration-v110): trigger auto-suffix "-2/-3/..." → insert/update
 *     tidak pernah 23505 lagi (safety net semua jalur).
 *   - Frontend (file ini): pre-check sebelum insert supaya UX-nya benar —
 *     nama duplikat persis DICEGAH dengan pesan jelas (bukan dibuat-buat
 *     slug beda secara diam-diam), plus pesan error ramah bila race.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Varian longgar Supabase client — kompatibel dengan browser & server client
 * apa pun generik schemanya (assignability dua arah tanpa deep instantiation).
 * (Tanpa eslint-disable — rule @typescript-eslint/no-explicit-any tidak
 * dimuat di config ESLint project ini, menyebutnya justru error di CI.)
 */
type AnySupabaseClient = SupabaseClient<any, any, any>;

/** Slugify standar (identik dgn pola lama di 3 halaman). */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Cek apakah nama/slug client sudah dipakai client lain.
 * - `excludeId`: untuk mode edit/rename (abaikan dirinya sendiri).
 * - Return null jika bebas; selain itu kembalikan nama pemilik slug bentrok.
 */
export async function findSlugConflict(
  supabase: AnySupabaseClient,
  name: string,
  excludeId?: string | null
): Promise<string | null> {
  const slug = slugify(name);
  if (!slug) return null;

  let query = supabase.from("clients").select("id, name").eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.limit(1);
  if (error) return null; // pre-check best-effort; layer DB tetap jaring pengaman
  const hit = (data as unknown as Array<{ id: string; name: string }> | null)?.[0];
  return hit ? hit.name : null;
}

/**
 * Pesan error ramah untuk kegagalan simpan client.
 * Terjemahkan error Postgres 23505 (slug) jadi bahasa user; error lain apa adanya.
 */
export function friendlyClientError(err: unknown, name: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);

  if (/clients_slug_key|duplicate key/i.test(raw)) {
    return `Client "${name}" sudah ada (nama/slug sama dipakai client lain). Gunakan nama berbeda — atau pilih client yang sudah ada.`;
  }
  return raw;
}