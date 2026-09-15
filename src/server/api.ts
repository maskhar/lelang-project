import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";

export function apiErrorResponse(error: unknown) {
  const requestId = randomUUID();
  const failure = error instanceof AuthHttpError ? error
    : error instanceof AuthenticationError ? new AuthHttpError(401, "UNAUTHENTICATED", error.message)
    : error instanceof AuthorizationError ? new AuthHttpError(403, "FORBIDDEN", error.message)
    : error instanceof ZodError ? new AuthHttpError(422, "VALIDATION_ERROR", "Input tidak valid.")
    : new AuthHttpError(503, "SERVICE_UNAVAILABLE", "Layanan belum tersedia.");
  if (failure.status >= 500) console.error(JSON.stringify({ event: "api.failure", requestId }));
  const response = NextResponse.json({ error: { code: failure.code, message: failure.message, requestId } }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  if (failure.retryAfter) response.headers.set("Retry-After", String(failure.retryAfter));
  return response;
}
