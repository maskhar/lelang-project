import { getDatabasePool } from "@/server/db/client";
import { processMedia } from "./process-media";
import { discard, discardPublic } from "@/server/storage/local";
import { deliverLeadWebhook } from "@/server/webhooks/deliver";
import { deliverNotificationWebhook } from "@/server/webhooks/notification";

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
        else if (event.type === "webhook.lead_created") await deliverLeadWebhook(pool, event);
        else if (event.type === "webhook.notification") await deliverNotificationWebhook(pool, event);
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
