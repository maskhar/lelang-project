"use client";

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public retryAfter?: number) { super(message); }
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string; requestId?: string } } | null;
  if (!response.ok) throw new ApiClientError(response.status, body?.error?.code || "REQUEST_FAILED", body?.error?.message || "Permintaan gagal diproses.", body?.error?.requestId, Number(response.headers.get("retry-after") || 0) || undefined);
  return body?.data as T;
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> { return readApiResponse<T>(await fetch(input, init)); }
