// Format tanggal+jam WIB dipakai UI dashboard (webhook, popup audit) dan pesan webhook notifikasi staf,
// supaya waktu yang ditampilkan admin dan yang dikirim ke webhook selalu format yang sama.
export const formatWib = (value: string | Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
