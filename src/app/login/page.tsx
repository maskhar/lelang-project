export default function LoginPage() {
  return (
    <main style={{ maxWidth: 540, margin: "80px auto", padding: 24 }}>
      <h1>Masuk dengan Google</h1>
      <p>Gunakan akun Google yang sudah disetujui administrator. Tidak ada login password.</p>
      <a href="/api/v1/auth/google/start">Lanjutkan dengan Google</a>
      <p>Google hanya memverifikasi identitas. Hak akses dikelola aplikasi.</p>
    </main>
  );
}
