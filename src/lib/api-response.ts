/**
 * Standardized API Response Helpers
 *
 * Provides consistent response format across all API routes:
 * { success: boolean, data?: T, error?: string, message?: string }
 *
 * @example
 * // Success:
 * return apiSuccess(data);
 * // → { success: true, data: [...] }
 *
 * // Error:
 * return apiError("RECORD_NOT_FOUND", "Client not found", 404);
 * // → { success: false, error: "RECORD_NOT_FOUND", message: "Client not found" }
 */

import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Return a standardized success response.
 *
 * @param data - The payload to return
 * @param status - HTTP status code (default 200)
 * @param message - Optional success message
 */
export function apiSuccess<T>(data: T, status = 200, message?: string): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data, message }, { status });
}

/**
 * Return a standardized error response.
 *
 * @param error - Machine-readable error code (e.g., "VALIDATION_ERROR")
 * @param message - Human-readable error message
 * @param status - HTTP status code (default 400)
 */
export function apiError(
  error: string,
  message: string,
  status = 400
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ success: false, error, message }, { status });
}

// Convenience wrappers for common HTTP status codes

export function apiBadRequest(message: string, error = "BAD_REQUEST") {
  return apiError(error, message, 400);
}

export function apiUnauthorized(message = "Authentication required") {
  return apiError("UNAUTHORIZED", message, 401);
}

export function apiForbidden(message = "You do not have permission to perform this action") {
  return apiError("FORBIDDEN", message, 403);
}

export function apiNotFound(message = "Resource not found") {
  return apiError("NOT_FOUND", message, 404);
}

export function apiServerError(message = "Internal server error") {
  return apiError("INTERNAL_ERROR", message, 500);
}