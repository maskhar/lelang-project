"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import viewerStyles from "./photo-gallery.module.css";
import styles from "./property-detail.module.css";

export default function PropertyHeroGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (images.length < 2 || paused || viewerOpen) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const interval = window.setInterval(() => {
      if (!motion.matches && !document.hidden) setActive((current) => (current + 1) % images.length);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [images.length, paused, viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (["Escape", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      if (event.key === "Escape") setViewerOpen(false);
      if (event.key === "ArrowLeft") setActive((current) => (current - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setActive((current) => (current + 1) % images.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [images.length, viewerOpen]);

  if (!images.length) return <div className={styles.placeholder}><div className={styles.emptyVisual}><span>Foto properti</span><b>Foto properti akan segera tersedia</b></div></div>;
  const current = active % images.length;
  const previewIndexes = Array.from({ length: Math.min(4, images.length) }, (_, index) => index);
  const move = (direction: number) => setActive((current) => (current + direction + images.length) % images.length);

  return <><div className={styles.gallery} aria-label={"Galeri otomatis " + title}>
    <div className={styles.mainImage}>
      <button type="button" className={styles.openGallery} aria-label={"Buka foto " + (current + 1) + " dalam popup"} onClick={() => setViewerOpen(true)}>
      <Image key={images[current]} src={images[current]} alt={"Foto " + (current + 1) + " " + title} fill unoptimized priority sizes="(max-width: 900px) 100vw, 65vw" />
      </button>
      <div className={styles.carouselControls}>
        <span>{current + 1} / {images.length}</span>
        {images.length > 1 && <><button type="button" aria-label="Foto sebelumnya" onClick={() => move(-1)}>←</button><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Putar" : "Jeda"}</button><button type="button" aria-label="Foto berikutnya" onClick={() => move(1)}>→</button></>}
      </div>
    </div>
    {previewIndexes.length > 1 && <div className={styles.imageGrid}>{previewIndexes.map((imageIndex, index) => <button type="button" className={styles.smallImage} key={images[imageIndex] + imageIndex} aria-label={index === previewIndexes.length - 1 && images.length > 4 ? "Lihat semua " + images.length + " foto" : "Tampilkan foto " + (imageIndex + 1)} aria-pressed={current === imageIndex} onClick={() => index === previewIndexes.length - 1 && images.length > 4 ? setViewerOpen(true) : setActive(imageIndex)}><Image src={images[imageIndex]} alt={"Preview foto " + (imageIndex + 1) + " " + title} fill unoptimized sizes="(max-width: 600px) 25vw, 15vw" />{index === previewIndexes.length - 1 && images.length > 4 && <span>Lihat semua</span>}</button>)}</div>}
  </div>
  {viewerOpen && <dialog ref={dialog} className={viewerStyles.backdrop} onCancel={() => setViewerOpen(false)} aria-label={"Galeri foto " + title} onClick={(event) => { if (event.target === event.currentTarget) setViewerOpen(false); }}><div className={viewerStyles.viewer}><div className={viewerStyles.toolbar}><span>Foto {current + 1} dari {images.length}</span><button type="button" aria-label="Tutup galeri" onClick={() => setViewerOpen(false)}>×</button></div><div className={viewerStyles.stage} onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerCancel={() => { gesture.current = null; }} onPointerUp={(event) => { const start = gesture.current; gesture.current = null; if (!start) return; const horizontal = event.clientX - start.x; const vertical = event.clientY - start.y; if (Math.abs(horizontal) > 50 && Math.abs(horizontal) > Math.abs(vertical)) move(horizontal < 0 ? 1 : -1); }}><Image src={images[current]} alt={"Foto " + (current + 1) + " " + title} fill unoptimized sizes="100vw" /></div>{images.length > 1 && <div className={viewerStyles.navigation}><button type="button" aria-label="Foto sebelumnya" onClick={() => move(-1)}>←</button><span>Geser foto atau gunakan tombol panah</span><button type="button" aria-label="Foto berikutnya" onClick={() => move(1)}>→</button></div>}</div></dialog>}
  </>;
}
