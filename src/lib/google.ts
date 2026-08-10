import { google } from "googleapis";

export interface GoogleTokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  scope: string | null;
  token_type: string | null;
}

/**
 * Get the OAuth2 client configured with the app credentials.
 */
export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"}/api/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get the scopes required for Calendar + Meet generation.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

/**
 * Build an OAuth2 client from stored user tokens.
 * Automatically refreshes if access token is expired.
 */
export function getOAuthClientFromTokens(tokens: GoogleTokenRow) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || undefined,
  });
  return client;
}

/**
 * Generate auth URL for the OAuth consent screen.
 */
export function getAuthUrl(state: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}