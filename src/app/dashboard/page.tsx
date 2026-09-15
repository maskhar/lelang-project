"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import PropertyForm, { type ListingFormValue } from "@/components/property-form";
import { apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import styles from "./dashboard-shell.module.css";

export default function Dashboard() {
  const router = useRouter();
  const createdId = useRef<string | null>(null);
  async function create(value: ListingFormValue) {
    if (!createdId.current) {
      const result = await apiRequest<{ property: { id: string } }>("/api/v1/properties", { method: "POST", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify(value) });
      createdId.current = result.property.id;
    }
    router.push("/dashboard/properties/" + createdId.current);
  }
  return <><div className={styles.heading}><div><h1>Tambah draft</h1><p>Simpan data dahulu. Foto dan pengajuan review dilakukan di editor setelah draft terbentuk.</p></div></div><section className={styles.panel}><PropertyForm onSave={create} /></section></>;
}
