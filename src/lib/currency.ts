const compactNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const exactNumber = new Intl.NumberFormat("id-ID");
export function formatRupiah(value: number) {
  if (!Number.isFinite(value)) return "Rp 0";
  if (value >= 1_000_000_000_000) return "Rp " + compactNumber.format(value / 1_000_000_000_000) + " T";
  if (value >= 1_000_000_000) return "Rp " + compactNumber.format(value / 1_000_000_000) + " M";
  if (value >= 1_000_000) return "Rp " + compactNumber.format(value / 1_000_000) + " jt";
  if (value >= 1_000) return "Rp " + compactNumber.format(value / 1_000) + " rb";
  return "Rp " + exactNumber.format(value);
}
export function formatExactRupiah(value: number) { return "Rp " + exactNumber.format(Number.isFinite(value) ? value : 0); }
