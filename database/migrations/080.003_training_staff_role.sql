BEGIN;
ALTER TABLE user_role_requests DROP CONSTRAINT IF EXISTS user_role_requests_role_check;
ALTER TABLE user_role_requests ADD CONSTRAINT user_role_requests_role_check CHECK(role IN ('PATIENT','CARETAKER','STAFF','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN'));
INSERT INTO schema_migrations(version,description) VALUES('080.003','Training-only access for general staff and attendants') ON CONFLICT DO NOTHING;
COMMIT;
