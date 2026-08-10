import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSecret, generateOTPAuthURL, generateBackupCodes, verifyTOTP } from '@/lib/totp';

interface Profile2FA {
  id: string;
  email: string;
  role: string;
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  two_factor_backup_codes: string[] | null;
  two_factor_enabled_at: string | null;
}

/**
 * POST /api/auth/2fa
 * Body: { action: 'setup' | 'verify' | 'disable', token?, secret? }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    // Get current profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email, role, two_factor_enabled, two_factor_secret')
      .eq('id', user.id)
      .single();

    const profile = profileData as Profile2FA | null;

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // === SETUP: Generate secret ===
    if (action === 'setup') {
      const secret = generateSecret();
      const otpauthUrl = generateOTPAuthURL(profile.email, secret);

      return NextResponse.json({
        secret,
        otpauthUrl,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
      });
    }

    // === VERIFY: Enable 2FA ===
    if (action === 'verify') {
      const { token, secret } = body as { token: string; secret: string };

      if (!token || !secret) {
        return NextResponse.json({ error: 'Token and secret required' }, { status: 400 });
      }

      const valid = verifyTOTP(token, secret);
      if (!valid) {
        return NextResponse.json({ error: 'Kode TOTP tidak valid. Coba lagi.' }, { status: 400 });
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes();

      // Save to DB
      const { error } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: true,
          two_factor_secret: secret,
          two_factor_backup_codes: backupCodes,
          two_factor_enabled_at: new Date().toISOString(),
        } as never)
        .eq('id', user.id);

      if (error) {
        return NextResponse.json({ error: 'Gagal menyimpan konfigurasi 2FA' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        backupCodes,
        message: '2FA berhasil diaktifkan. Simpan backup codes di tempat aman.',
      });
    }

    // === DISABLE: Turn off 2FA ===
    if (action === 'disable') {
      const { token } = body as { token: string };

      if (!profile.two_factor_enabled) {
        return NextResponse.json({ error: '2FA tidak aktif' }, { status: 400 });
      }

      // Verify token before disabling
      if (profile.two_factor_secret) {
        const valid = verifyTOTP(token, profile.two_factor_secret);
        if (!valid) {
          return NextResponse.json({ error: 'Token tidak valid' }, { status: 400 });
        }
      }

      await supabase
        .from('profiles')
        .update({
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_backup_codes: null,
          two_factor_enabled_at: null,
        } as never)
        .eq('id', user.id);

      return NextResponse.json({ success: true, message: '2FA berhasil dinonaktifkan' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[2FA API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET — Check 2FA status */
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data } = await supabase
      .from('profiles')
      .select('two_factor_enabled, two_factor_enabled_at')
      .eq('id', user.id)
      .single();

    const profile = data as Partial<Profile2FA> | null;

    return NextResponse.json({
      enabled: profile?.two_factor_enabled || false,
      enabledAt: profile?.two_factor_enabled_at || null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}