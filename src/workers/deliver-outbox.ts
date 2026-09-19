import nodemailer from "nodemailer";
import { getDatabasePool } from "@/server/db/client";
import { processMedia } from "./process-media";
import { discard, discardPublic } from "@/server/storage/local";
import { deliverLeadWebhook } from "@/server/webhooks/deliver";

const roleLabels: Record<string, string> = { admin: "Administrator", editor: "Editor", owner: "Pemilik produk", agent: "Agent", buyer: "Pembeli" };

async function notifyAccessRequest(event: { id: string; payload: Record<string, unknown> }) {
  const email = event.payload.email ? String(event.payload.email) : null;
  if (!email) { console.warn(JSON.stringify({ event: "outbox.access_request.no_email", id: event.id })); return; }
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) throw new Error("SMTP not configured.");
  const approved = event.payload.status === "approved";
  const roleLabel = roleLabels[String(event.payload.requestedRole)] ?? String(event.payload.requestedRole);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === "465", requireTLS: process.env.NODE_ENV === "production", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined, connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 3000 });
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM, to: email, messageId: "<" + event.id + "@lelang.local>",
      subject: approved ? "Pengajuan akses " + roleLabel + " disetujui" : "Pengajuan akses " + roleLabel + " ditolak",
      text: approved
        ? "Pengajuan akses Anda sebagai " + roleLabel + " telah disetujui. Silakan masuk kembali di dashboard untuk mulai menggunakan akses baru."
        : "Pengajuan akses Anda sebagai " + roleLabel + " ditolak." + (event.payload.note ? " Catatan administrator: " + String(event.payload.note) : " Hubungi administrator untuk informasi lebih lanjut."),
    });
  } finally { transport.close(); }
}

export async function deliverOutbox(limit = 25) {
  const pool = getDatabasePool();
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query("select id,type,payload,attempts from app.outbox_events where status='pending' and available_at<=now() order by created_at,id for update skip locked limit 1");
      const event = rows[0];
      if (!event) { await client.query("commit"); break; }
      try {
        if (event.type === "media.verify") await processMedia(String(event.payload.mediaId));
        else if (event.type === "media.cleanup") {
          const media = await pool.query("select bucket,object_path from app.property_media where id=$1 and status='deleted'", [String(event.payload.mediaId)]);
          if (media.rows[0]) await (media.rows[0].bucket === "public" ? discardPublic(media.rows[0].object_path) : discard(media.rows[0].object_path));
        }
        else if (["lead.created", "property.review"].includes(event.type)) {
          if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM || !process.env.NOTIFICATION_EMAIL) throw new Error("SMTP not configured.");
          const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === "465", requireTLS: process.env.NODE_ENV === "production", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined, connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 3000 });
          try { await transport.sendMail({ from: process.env.EMAIL_FROM, to: process.env.NOTIFICATION_EMAIL, messageId: "<" + event.id + "@lelang.local>", subject: event.type === "lead.created" ? "Lead properti baru" : "Review properti diperbarui", text: "Buka dashboard aplikasi untuk menindaklanjuti. Referensi: " + String(event.payload.leadId || event.payload.propertyId) }); }
          finally { transport.close(); }
        } else if (event.type === "webhook.lead_created") await deliverLeadWebhook(pool, event);
        else if (event.type === "access_request.reviewed") await notifyAccessRequest(event);
        else throw new Error("Unknown event.");
        await client.query("update app.outbox_events set status='processed',processed_at=now(),attempts=attempts+1,last_error=null where id=$1", [event.id]);
        processed++;
      } catch {
        const attempts = event.attempts + 1;
        await client.query("update app.outbox_events set status=$2,attempts=$3,available_at=now()+make_interval(secs=>$4),last_error='delivery failed' where id=$1", [event.id, attempts >= 8 ? "dead_letter" : "pending", attempts, Math.min(3600, 2 ** attempts * 15)]);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  return processed;
}
