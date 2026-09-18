import "server-only";

// Nama Google opsional; profiles.name NOT NULL varchar(120). Fallback ke local-part email.
export function profileNameFromIdentity(identity: { name?: string; email: string }) {
  return (identity.name?.trim() || identity.email.split("@")[0] || "Pengguna").slice(0, 120);
}

// profiles punya CHECK email = lower(email) dan unique index lower(email). loginWithGoogle juga
// dipanggil dev-login dan skrip test, jadi kanonikalisasi diverifikasi ulang sebelum INSERT.
export function isProvisionableEmail(email: string) {
  return email.length > 3 && email.length <= 320 && email === email.toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Role default pendaftaran mandiri. Role tidak pernah berasal dari claim Google (AGENTS.md).
export const defaultSignupRole = "buyer" as const;
