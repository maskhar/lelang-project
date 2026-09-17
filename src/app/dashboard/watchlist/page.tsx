"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { formatRupiah } from "@/lib/currency";
import styles from "../dashboard-shell.module.css";
type Item={propertyId:string;slug:string;title:string;askingPrice:number};
export default function Watchlist(){const[items,setItems]=useState<Item[]>([]);const[error,setError]=useState("");async function load(){try{setItems(await apiRequest<Item[]>("/api/v1/watchlist",{cache:"no-store"}))}catch(e){setError(e instanceof Error?e.message:"Gagal memuat watchlist.")}}useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t)},[]);async function remove(propertyId:string){await apiRequest("/api/v1/watchlist",{method:"DELETE",headers:{"Content-Type":"application/json",...await csrfHeaders()},body:JSON.stringify({propertyId})});await load()}return <><div className={styles.heading}><div><h1>Properti tersimpan</h1><p>Watchlist properti yang ingin Anda pantau.</p></div></div><section className={styles.panel}>{error&&<p className={styles.error}>{error}</p>}{items.length?<ul className={styles.list}>{items.map(item=><li key={item.propertyId}><strong>{item.title}</strong><span>{formatRupiah(item.askingPrice)}</span><Link href={'/properti/'+item.slug}>Buka</Link><button onClick={()=>void remove(item.propertyId)}>Hapus</button></li>)}</ul>:<p className={styles.empty}>Belum ada properti tersimpan.</p>}</section></>}
