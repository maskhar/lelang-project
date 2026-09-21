import "server-only";
import { manageableRoles, type ManageableRole } from "./admin-users";
import { AuthHttpError } from "./http";

// Validasi filter dan urutan daftar akun /dashboard/users. Nilainya TIDAK divalidasi di skema .strict()
// milik adminPage karena setiap halaman admin punya himpunan nilai sendiri (status outbox bukan status
// akun) — skema di sana hanya memastikan bentuknya string pendek, artinya diputuskan di sini.
//
// Fungsi di modul ini murni: tidak menyentuh DB, jadi bisa diuji unit seperti sisa test repo.

export const userStatusFilters = ["active", "disabled"] as const;
export type UserStatusFilter = (typeof userStatusFilters)[number];

// "tanpa_role" bukan nilai enum app.user_role: artinya akun tanpa satu pun baris user_roles. Kelompok itu
// tidak bisa dicari lewat filter role biasa padahal justru yang paling perlu ditengok admin.
export const userRoleFilters = [...manageableRoles, "tanpa_role"] as const;
export type UserRoleFilter = (typeof userRoleFilters)[number];

export const userSortKeys = ["email", "nama", "terbaru", "terlama", "role"] as const;
export type UserSortKey = (typeof userSortKeys)[number];

// Peringkat role untuk sort: admin dulu, buyer terakhir. Satu akun bisa punya beberapa role, jadi yang
// dipakai adalah peringkat TERTINGGI yang dimilikinya (min angka) — admin+buyer tetap tampil di kelompok admin.
// Sumber tunggal angka ini; query membangun CASE-nya dari sini supaya role baru tidak diam-diam tak berperingkat.
export const roleSortRank: Record<ManageableRole, number> = { admin: 1, owner: 2, editor: 3, agent: 4, buyer: 5 };

function pick<T extends string>(value: string | undefined, allowed: readonly T[], message: string) {
  if (!value) return undefined;
  if (!allowed.includes(value as T)) throw new AuthHttpError(422, "INVALID_QUERY", message);
  return value as T;
}

// Nilai asing ditolak 422, bukan diteruskan ke Postgres: sebelum ini `status` sembarang menjadi
// "invalid input value for enum" dan keluar sebagai 503 seolah layanan yang rusak.
export function parseUserListQuery(input: { status?: string; role?: string; sort?: string }) {
  return {
    status: pick(input.status, userStatusFilters, "Status akun tidak dikenal."),
    role: pick(input.role, userRoleFilters, "Filter role tidak dikenal."),
    sort: pick(input.sort, userSortKeys, "Urutan daftar akun tidak dikenal.") ?? "email",
  };
}
