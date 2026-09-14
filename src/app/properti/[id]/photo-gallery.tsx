"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./photo-gallery.module.css";

export default function PhotoGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const isOpen = active !== null;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setActive((index) => index === null ? null : (index + direction + images.length) % images.length);
      }
      if (event.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [isOpen, images.length]);

  function move(direction: number) {
    setActive((index) => index === null ? null : (index + direction + images.length) % images.length);
  }

  return <>
    <section className={styles.gallery} aria-label="Semua foto properti">
      <h2>Semua foto properti <span>({images.length})</span></h2>
      <div className={styles.grid}>{images.map((image, index) => <button key={image + index} type="button" className={styles.thumbnail} onClick={() => setActive(index)} aria-label={"Lihat foto " + (index + 1)}><Image src={image} alt={"Foto " + (index + 1) + " " + title} fill unoptimized sizes="(max-width: 600px) 50vw, 240px" /></button>)}</div>
    </section>
    {active !== null && <div className={styles.backdrop} onClick={(event) => { if (event.target === event.currentTarget) setActive(null); }}>
      <div ref={dialog} className={styles.viewer} role="dialog" aria-modal="true" aria-label={"Galeri foto " + title}>
        <div className={styles.toolbar}><span aria-live="polite">Foto {active + 1} dari {images.length}</span><button type="button" aria-label="Tutup galeri" onClick={() => setActive(null)}>×</button></div>
        <div className={styles.stage} onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          gesture.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start) return;
          const horizontal = event.clientX - start.x;
          const vertical = event.clientY - start.y;
          if (Math.abs(horizontal) > 50 && Math.abs(horizontal) > Math.abs(vertical)) move(horizontal < 0 ? 1 : -1);
        }} onPointerCancel={() => { gesture.current = null; }}>
          <Image key={images[active]} src={images[active]} alt={"Foto " + (active + 1) + " " + title} fill unoptimized sizes="100vw" draggable={false} />
        </div>
        <div className={styles.navigation}><button type="button" onClick={() => move(-1)} disabled={images.length < 2} aria-label="Foto sebelumnya">←</button><span>Geser foto atau gunakan tombol panah</span><button type="button" onClick={() => move(1)} disabled={images.length < 2} aria-label="Foto berikutnya">→</button></div>
      </div>
    </div>}
  </>;
}
