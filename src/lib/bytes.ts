// Ukuran file dipakai server (statistik media library) dan client (tabel), jadi tanpa "use client"/server-only.
// Tangga 1024 karena angka pembandingnya adalah `du`/properties disk, bukan satuan pemasaran (1000).
const oneDigit = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat("id-ID");
const units = [
  { limit: 1024 ** 4, suffix: " TB" },
  { limit: 1024 ** 3, suffix: " GB" },
  { limit: 1024 ** 2, suffix: " MB" },
  { limit: 1024, suffix: " KB" },
];

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  for (const unit of units) if (value >= unit.limit) return oneDigit.format(value / unit.limit) + unit.suffix;
  return exact.format(Math.round(value)) + " B";
}
