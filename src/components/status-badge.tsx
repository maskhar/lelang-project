import styles from "@/app/dashboard/dashboard-shell.module.css";

type Kind = "publication" | "media" | "lead" | "outbox";
const labels: Record<string, string> = { draft: "Draft", pending_review: "Menunggu review", revision_required: "Perlu revisi", published: "Dipublikasikan", rejected: "Ditolak", archived: "Diarsipkan", pending: "Menunggu", ready: "Siap", deleted: "Dihapus", contacted: "Dihubungi", closed: "Selesai", spam: "Spam", processing: "Diproses", processed: "Selesai", dead_letter: "Gagal permanen" };
export function StatusBadge({ value, kind }: { value: string; kind: Kind }) { return <span className={styles.badge} data-kind={kind} data-status={value}>{labels[value] || value.replaceAll("_", " ")}</span>; }
