import { appSchema } from "./namespace";

export const userRole = appSchema.enum("user_role", ["editor", "admin"]);
export const userStatus = appSchema.enum("user_status", ["active", "disabled"]);
export const saleMode = appSchema.enum("sale_mode", ["auction", "direct_sale"]);
export const publicationStatus = appSchema.enum("publication_status", ["draft", "pending_review", "revision_required", "scheduled", "published", "paused", "rejected", "archived"]);
export const availabilityStatus = appSchema.enum("availability_status", ["available", "sold"]);
export const reviewStatus = appSchema.enum("review_status", ["draft", "pending", "approved", "revision_required", "rejected"]);
export const mediaStatus = appSchema.enum("media_status", ["pending", "ready", "rejected", "deleted"]);
export const leadStatus = appSchema.enum("lead_status", ["new", "contacted", "closed", "spam"]);
export const outboxStatus = appSchema.enum("outbox_status", ["pending", "processing", "processed", "dead_letter"]);
