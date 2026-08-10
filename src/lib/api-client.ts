/**
 * Centralized API client with error handling, retry logic, and typed responses.
 * Usage: const data = await apiGet<T>('/api/clients');
 */

export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: unknown;
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert various error formats to user-friendly Indonesian messages.
 */
export function formatApiError(err: unknown): string {
  if (!err) return "Terjadi kesalahan yang tidak diketahui";

  // Already an ApiError
  if (typeof err === "object" && err !== null && "message" in err && "status" in err) {
    return (err as ApiError).message;
  }

  // Fetch network error
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return "Koneksi terputus. Periksa internet Anda dan coba lagi.";
  }

  // Generic Error
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("failed to fetch")) {
      return "Koneksi terputus. Periksa internet Anda dan coba lagi.";
    }
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return "Permintaan waktu habis. Silakan coba lagi.";
    }
    return err.message;
  }

  if (typeof err === "string") return err;

  return "Terjadi kesalahan yang tidak diketahui";
}

/**
 * Parse error from Response object.
 */
async function parseResponseError(res: Response): Promise<ApiError> {
  let message = `Terjadi kesalahan (${res.status})`;
  let code: string | undefined;
  let details: unknown;

  try {
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const body = await res.json();
      message = body.error || body.message || message;
      code = body.code;
      details = body.details;
    }
  } catch {
    // Response body isn't JSON, use status-based messages
  }

  // Status-based user-friendly messages
  const statusMessages: Record<number, string> = {
    400: "Data yang dikirim tidak valid. Periksa kembali input Anda.",
    401: "Sesi Anda telah berakhir. Silakan login kembali.",
    403: "Anda tidak memiliki izin untuk melakukan aksi ini.",
    404: "Data yang dicari tidak ditemukan.",
    409: "Data sudah ada. Tidak boleh duplikat.",
    422: "Data yang dikirim tidak valid. Periksa kembali.",
    429: "Terlalu banyak permintaan. Tunggu beberapa saat dan coba lagi.",
    500: "Terjadi kesalahan di server. Tim kami telah diberi tahu.",
    502: "Server sedang tidak tersedia. Coba lagi nanti.",
    503: "Layanan sedang maintenance. Coba lagi nanti.",
    504: "Server tidak merespons. Coba lagi nanti.",
  };

  if (statusMessages[res.status]) {
    message = statusMessages[res.status];
  }

  return { message, status: res.status, code, details };
}

/**
 * Determine if a request should be retried.
 */
function shouldRetry(status: number, attempt: number): boolean {
  if (attempt >= MAX_RETRIES) return false;
  // Retry on server errors and rate limiting
  return status >= 500 || status === 429;
}

/**
 * Core fetch wrapper with retry, error parsing, and auth handling.
 */
async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  attempt = 0
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (err) {
    // Network error — retry once
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY * (attempt + 1));
      return apiFetch<T>(url, options, attempt + 1);
    }
    throw {
      message: formatApiError(err),
      status: 0,
    } as ApiError;
  }

  // Handle non-JSON responses
  if (res.status === 204) {
    return undefined as T;
  }

  // Parse error response
  if (!res.ok) {
    const apiErr = await parseResponseError(res);

    // Retry if eligible
    if (shouldRetry(apiErr.status, attempt)) {
      await sleep(RETRY_DELAY * (attempt + 1));
      return apiFetch<T>(url, options, attempt + 1);
    }

    // Redirect on auth failure (unless we're already on auth pages)
    if (apiErr.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      const current = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${current}`;
    }

    throw apiErr;
  }

  // Parse success response
  try {
    return (await res.json()) as T;
  } catch {
    // Response is OK but not JSON
    return undefined as T;
  }
}

/**
 * GET request
 */
export async function apiGet<T>(url: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(url, { ...options, method: "GET" });
}

/**
 * POST request
 */
export async function apiPost<T>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export async function apiPut<T>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request
 */
export async function apiPatch<T>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function apiDelete<T>(url: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(url, { ...options, method: "DELETE" });
}

/**
 * Safe async wrapper — never throws, returns [data, error].
 * Perfect for components that use toast for errors.
 *
 * Usage:
 * const [data, error] = await safeApi(() => apiGet('/api/clients'));
 * if (error) { toast.error(error.message); return; }
 */
export async function safeApi<T>(
  fn: () => Promise<T>
): Promise<[T | null, ApiError | null]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (err) {
    const apiErr: ApiError =
      typeof err === "object" && err !== null && "message" in err && "status" in err
        ? (err as ApiError)
        : { message: formatApiError(err), status: 0 };
    return [null, apiErr];
  }
}