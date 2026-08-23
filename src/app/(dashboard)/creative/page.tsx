import { redirect } from "next/navigation";

/**
 * /creative sudah tidak dipakai — creative request untuk ads sekarang ada di
 * Content Studio (tab "Creative Request", tabel ads_creative_requests).
 * Redirect menjaga bookmark / notifikasi lama tetap jalan.
 */
export default function CreativeRequestsRedirectPage() {
  redirect("/content-studio");
}