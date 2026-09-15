"use client";
import { readApiResponse } from "./api-client";

export async function csrfHeaders() {
  const response = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
  await readApiResponse<void>(response.clone());
  const token = response.headers.get("x-csrf-token");
  if (!token) throw new Error("Token CSRF tidak tersedia.");
  return { "X-CSRF-Token": token };
}
