"use client";
import Link from "next/link";
import { ApiClientError } from "./api-client";

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const failure = error instanceof Error ? error : new Error("Permintaan gagal.");
  return <div role="alert"><p>{failure.message}</p>{failure instanceof ApiClientError && <>{failure.status === 401 && <Link href="/login">Login kembali</Link>}{failure.status === 409 && <p>Data formulir tetap ada. Muat ulang data server sebelum mencoba lagi; jangan menimpa perubahan editor lain.</p>}{failure.retryAfter && <p>Coba kembali setelah {failure.retryAfter} detik.</p>}{failure.requestId && <small>Referensi: {failure.requestId}</small>}</>}</div>;
}
