-- File ini dipakai development (lelang_properti_dev) dan produksi Docker (lelang_properti_prod).
-- GRANT CONNECT butuh nama database literal, jadi dibangun dinamis dari current_database()
-- agar tidak pernah salah menunjuk database environment lain.
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO lelang_app', current_database()); END $$;
GRANT USAGE ON SCHEMA app TO lelang_app;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO lelang_app;
GRANT UPDATE (updated_at, email_verified_at, name, avatar_url, phone, email, status) ON app.profiles TO lelang_app;
-- Pendaftaran mandiri lewat Google. Kolom-level: runtime tidak pernah boleh memilih id, status,
-- created_at, atau updated_at sendiri — semuanya mengandalkan default kolom (status = 'active').
GRANT INSERT (email, name, avatar_url, email_verified_at) ON app.profiles TO lelang_app;
GRANT INSERT, UPDATE, DELETE ON app.properties, app.property_revisions, app.property_media, app.leads, app.outbox_events, app.user_sessions, app.auth_rate_limits TO lelang_app;
GRANT INSERT, UPDATE ON app.access_requests TO lelang_app;
GRANT INSERT, UPDATE ON app.property_assignments TO lelang_app;
GRANT INSERT, DELETE ON app.property_watchlists TO lelang_app;
GRANT INSERT, DELETE ON app.user_roles TO lelang_app;
GRANT INSERT, DELETE ON app.user_identities TO lelang_app;
GRANT INSERT, DELETE ON app.oauth_transactions TO lelang_app;
GRANT INSERT ON app.audit_logs TO lelang_app;
REVOKE UPDATE, DELETE, TRUNCATE ON app.audit_logs FROM lelang_app;
REVOKE CREATE ON SCHEMA app FROM lelang_app;
