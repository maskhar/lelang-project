BEGIN;

DO $verify$
DECLARE
  profile_id uuid;
  property_id uuid;
  revision_id uuid;
BEGIN
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'app') <> 12 THEN
    RAISE EXCEPTION 'Expected 12 application tables';
  END IF;

  INSERT INTO app.profiles (email, name, email_verified_at)
    VALUES ('migration-check@example.invalid', 'Migration verification', now()) RETURNING id INTO profile_id;
  INSERT INTO app.user_roles (user_id, role) VALUES (profile_id, 'editor');
  INSERT INTO app.user_identities (user_id, provider_subject, email)
    VALUES (profile_id, 'synthetic-google-subject', 'migration-check@example.invalid');
  INSERT INTO app.properties (slug, created_by, sale_mode, type, province_code, city_code, asking_price)
    VALUES ('migration-check', profile_id, 'auction', 'Rumah', '35', '3573', 9007199254740991) RETURNING id INTO property_id;
  INSERT INTO app.property_revisions (property_id, revision_number, title, description)
    VALUES (property_id, 1, 'Migration verification', 'Synthetic data.') RETURNING id INTO revision_id;
  INSERT INTO app.property_media (revision_id, bucket, object_path, content_type, size_bytes, is_cover)
    VALUES (revision_id, 'private-test', 'cover.webp', 'image/webp', 5242880, true);
  INSERT INTO app.leads (property_id, name, email, consent_at)
    VALUES (property_id, 'Verification', 'lead@example.invalid', now());
  INSERT INTO app.audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (profile_id, 'migration.check', 'property', property_id);
  INSERT INTO app.outbox_events (type, payload) VALUES ('migration.check', '{}');

  BEGIN
    UPDATE app.properties SET asking_price = 0 WHERE id = property_id;
    RAISE EXCEPTION 'Zero price was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE app.property_revisions SET auction_starts_at = now() WHERE id = revision_id;
    RAISE EXCEPTION 'Incomplete auction schedule was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE app.property_media SET size_bytes = 5242881 WHERE object_path = 'cover.webp';
    RAISE EXCEPTION 'Oversized image was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS: schema, inserts, and constraints';
END;
$verify$;

ROLLBACK;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM app.profiles) <> 0 THEN
    RAISE EXCEPTION 'Rollback failed';
  END IF;
  RAISE NOTICE 'PASS: synthetic data rolled back';
END;
$verify$;
