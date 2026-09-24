import { getContactDetails } from "@/server/contact";
import HomeView from "./home-view";

// Pembungkus server yang tipis: satu-satunya tugasnya membaca WHATSAPP_NUMBER (hanya tersedia di server)
// dan mengalirkannya ke footer di home-view.tsx, yang merupakan komponen klien karena katalognya
// interaktif. Tanpa pembungkus ini footer selalu memakai nomor default meski env diisi.

// force-dynamic supaya nomor dibaca per permintaan, bukan sekali saat build. Tanpa ini Next.js
// memprerender halaman ini dan membekukan nomor ke dalam output build — ganti nomor akan menuntut
// rebuild image, padahal seluruh pekerjaan ini justru untuk menghindarinya.
export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeView contact={getContactDetails()} />;
}
