--
-- master_data.sql — the rows a brand-new Zukatek database cannot work without.
--
-- GENERATED, not hand-written: produced by applying src/backend/migrations to an
-- empty database and dumping what the migrations seeded. Regenerate it with
-- deploy/sql/regenerate.sh after adding a migration; do not edit it by hand, or
-- it will quietly disagree with the migrations.
--
-- WHAT IS IN HERE
--   roles / permissions / role_permissions  the access model. Without these every
--                                           request is denied, including the first
--                                           login.
--   goose_db_version                        tells the API which migrations are
--                                           already applied. Without it the API
--                                           re-runs all of them on boot and fails
--                                           on the first CREATE TABLE.
--
-- WHAT IS NOT
--   system_settings  the API writes these lazily from its own registry defaults;
--                    a fresh install needs none of them.
--   the first user   see the block at the end — it needs a password hash that
--                    only the application can produce.
--
-- HOW TO USE IT
--   Pick ONE of these, never both:
--     a) psql -f ddl.sql -f master_data.sql     schema and data, no app needed
--     b) api migrate                            the app does both itself
--   Running (a) and then (b) is safe — every statement here is ON CONFLICT DO
--   NOTHING and goose will see the current version and skip — but (b) alone is simpler
--   unless you need the database to exist before the app does.
--
-- Every statement is idempotent: running this file twice changes nothing.
--

-- This file is UTF-8 and holds Vietnamese names. psql on Windows defaults its
-- client encoding to the console code page (WIN1252), which has no byte for the
-- Đ in "Lê Đức Trung" — the load fails on that line and stops. Saying so here
-- means the file reads the same on every machine, which is the point of a file
-- the whole team runs. ddl.sql carries the same line, put there by pg_dump.
SET client_encoding = 'UTF8';

BEGIN;

-- Roles, permissions and the grants between them.
INSERT INTO public.roles (id, code, name, description, is_system, created_at, updated_at) VALUES
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'admin', 'Admin', 'Platform administration', true, '2026-10-16 16:43:53.398399+07', '2026-10-16 16:43:53.398399+07'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'editor', 'Editor', 'Self-service baseline', true, '2026-10-16 16:43:53.398399+07', '2026-10-16 16:43:53.398399+07'),
	('f323a5ba-2a23-46b2-9bd8-7fa8bb36a03b', 'super_admin', 'Super Admin', 'Full access (wildcard)', true, '2026-10-16 16:43:53.398399+07', '2026-10-16 16:43:53.398399+07')
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions (id, code, description, created_at) VALUES
	('f09403d2-2e2b-4909-8361-983f7e243876', '*', 'Wildcard — all permissions', '2026-10-16 16:43:53.398399+07'),
	('135d04d0-d0ad-4abe-8afe-eeb6712f5d1c', 'impersonation.start', 'Impersonate another user', '2026-10-16 16:43:53.398399+07'),
	('22b0687c-ba85-4be6-b7bc-369c05d75cf3', 'permissions.read', 'View permission catalog', '2026-10-16 16:43:53.398399+07'),
	('9f871792-0309-4f83-96b0-daa1943502d3', 'roles.manage', 'Create/update/delete roles, assign permissions', '2026-10-16 16:43:53.398399+07'),
	('5b09e5c0-f089-4722-b81d-ff7987ed30fa', 'roles.read', 'View roles and their permissions', '2026-10-16 16:43:53.398399+07'),
	('2322ef0a-7aff-4acb-81c6-02c344320562', 'sessions.read', 'View other users'' sessions', '2026-10-16 16:43:53.398399+07'),
	('211ec405-9dbd-4201-b515-e176fd6c14e6', 'sessions.revoke', 'Revoke other users'' sessions', '2026-10-16 16:43:53.398399+07'),
	('e3b2fc2e-f92f-4784-8087-c26466539aad', 'settings.manage', 'Update system settings', '2026-10-16 16:43:53.398399+07'),
	('160c8e81-eaea-4f27-adbc-84c4d024d21d', 'settings.read', 'Read system settings', '2026-10-16 16:43:53.398399+07'),
	('84aba907-80d7-424b-be88-9bfbce30c121', 'users.assign_role', 'Assign/remove roles', '2026-10-16 16:43:53.398399+07'),
	('379477c7-6209-4c30-b133-0a55fe449d1b', 'users.create', 'Create users', '2026-10-16 16:43:53.398399+07'),
	('39a40902-e654-4239-b7f1-7f697f57bca1', 'users.delete', 'Delete/disable users', '2026-10-16 16:43:53.398399+07'),
	('ba41cf88-7857-43d6-b788-ec6348d86319', 'users.read', 'View users', '2026-10-16 16:43:53.398399+07'),
	('764f7d8e-29ea-44f5-b5e8-3037c00b776d', 'users.update', 'Update users', '2026-10-16 16:43:53.398399+07'),
	('5a1d6a21-5e4b-468a-9f57-948d6f6a690a', 'cms.article.create', 'Create articles', '2026-10-16 16:43:53.536671+07'),
	('2ccb0257-8f09-43fa-99c0-de7de8399265', 'cms.article.delete', 'Delete articles', '2026-10-16 16:43:53.536671+07'),
	('2d114b71-afb6-45f8-bfdd-66ded9a428dd', 'cms.article.edit', 'Edit articles', '2026-10-16 16:43:53.536671+07'),
	('e5494369-bd45-4d9e-b889-ffa292335517', 'cms.article.publish', 'Publish / schedule / unpublish / re-publish articles', '2026-10-16 16:43:53.536671+07'),
	('a60f860e-b097-4a37-a9ec-6ad128d87ac7', 'cms.article.review', 'Approve/reject articles pending review', '2026-10-16 16:43:53.536671+07'),
	('a8556a2f-af16-4ae9-bc48-8b84689d408c', 'cms.article.submit', 'Submit articles for review', '2026-10-16 16:43:53.536671+07'),
	('aa2529bd-9962-4855-a935-43d2fb905781', 'cms.article.view', 'View articles (editor: own only)', '2026-10-16 16:43:53.536671+07'),
	('182f199f-fc4b-4aa8-a5f4-a7f7e2d05515', 'cms.comment.moderate', 'Moderate comments', '2026-10-16 16:43:53.536671+07'),
	('ee6d6ceb-9477-4175-9ac4-f1e0c7e1572a', 'cms.landing.manage', 'Manage landing pages', '2026-10-16 16:43:53.536671+07'),
	('66a37875-b715-4c3d-a537-5c8341a5ee94', 'cms.menu.manage', 'Manage navigation menus', '2026-10-16 16:43:53.536671+07'),
	('8f77f492-3f95-4b5d-9adc-a3f4c773201b', 'cms.page.create', 'Create static pages', '2026-10-16 16:43:53.536671+07'),
	('5b01e8c4-ffe0-48f7-b25a-edc28a9fca52', 'cms.page.delete', 'Delete static pages', '2026-10-16 16:43:53.536671+07'),
	('a361cb03-ecc3-4884-bd0f-02f660519d98', 'cms.page.edit', 'Edit static pages', '2026-10-16 16:43:53.536671+07'),
	('8ac923f2-4c12-4fd0-b9be-a42f02ac6190', 'cms.page.publish', 'Publish/unpublish static pages', '2026-10-16 16:43:53.536671+07'),
	('88a4587d-c28b-458c-9c96-080ed7589606', 'cms.page.view', 'View static pages', '2026-10-16 16:43:53.536671+07'),
	('d28a933f-ab1a-4476-9920-22d96bfcf9c2', 'cms.settings.manage', 'Update CMS feature flags', '2026-10-16 16:43:53.536671+07'),
	('ea54c070-6a3c-4eaa-a64b-29d6402f3136', 'cms.settings.read', 'Read CMS feature flags', '2026-10-16 16:43:53.536671+07'),
	('9ed04580-cf7b-427c-9fd1-8efae95cde88', 'cms.taxonomy.manage', 'Create/update/delete categories and tags', '2026-10-16 16:43:53.536671+07'),
	('23a8c0b7-7b9b-45c2-9c09-82663f310bbf', 'cms.newsletter.manage', 'Manage newsletter subscribers', '2026-10-16 16:43:53.680799+07'),
	('073f6503-2db5-4350-8212-48134f697fed', 'members.manage', 'Create/update/delete team member profiles', '2026-10-16 16:43:53.684901+07'),
	('2d0ec878-0568-4772-ac36-bee73e4c030d', 'members.view', 'View team member profiles', '2026-10-16 16:43:53.684901+07'),
	('f2d88c12-07d8-45bb-b374-00098e513d67', 'products.category.manage', 'Create/update/delete product categories', '2026-10-16 16:43:53.699597+07'),
	('8409fbac-6cae-4882-a4de-4961f8bc75ef', 'products.view', 'View products and product categories', '2026-10-16 16:43:53.699597+07'),
	('ba697aaf-1190-493d-99bd-fa7fc073eb97', 'products.create', 'Create products', '2026-10-16 16:43:53.713021+07'),
	('a2d8344e-3c32-44fa-a19e-4e204f523477', 'products.delete', 'Delete products', '2026-10-16 16:43:53.713021+07'),
	('4b6ad4b3-5e1d-49b0-b89c-0e69546f795a', 'products.edit', 'Edit products', '2026-10-16 16:43:53.713021+07'),
	('abe50035-ecb9-4040-b31d-0a34c595db39', 'products.publish', 'Publish / unpublish / archive products', '2026-10-16 16:43:53.713021+07'),
	('9e9f10d6-f203-479b-a86e-161181bb4d8d', 'crm.leads.manage', 'Create, edit, assign and move leads', '2026-10-16 16:43:53.755802+07'),
	('c0717a92-e8d6-4c3e-a32f-2e9d0fe63b96', 'crm.leads.view', 'View leads assigned to you and the shared queue', '2026-10-16 16:43:53.755802+07'),
	('94e36ed3-8366-4c03-a14c-de88eeff0173', 'crm.leads.view_all', 'View every lead, including other people''s', '2026-10-16 16:43:53.755802+07'),
	('e1ba8ebb-e58e-4a0c-8ec4-4557efedcfe8', 'ai.chat.handle', 'Read the assistant inbox and take over conversations', '2026-10-16 16:43:53.776351+07'),
	('eafdf723-1fca-4ebe-9b26-fdfdd285228b', 'ai.mcp.use', 'Issue and use MCP tokens for agent access', '2026-10-16 16:43:53.805437+07'),
	('f1a14d32-49bf-4fe7-8167-8100b9a3d9e9', 'activity.read', 'Read the activity log', '2026-10-16 16:43:53.871021+07'),
	('e4a06bdb-5e0d-4f70-ba98-31bac393ba17', 'activity.purge', 'Permanently delete activity log entries older than a chosen date', '2026-10-16 16:43:53.921097+07')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id) VALUES
	('051e5edd-b9a6-491a-9997-1812ad113fae', '073f6503-2db5-4350-8212-48134f697fed'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '182f199f-fc4b-4aa8-a5f4-a7f7e2d05515'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '211ec405-9dbd-4201-b515-e176fd6c14e6'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '22b0687c-ba85-4be6-b7bc-369c05d75cf3'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '2322ef0a-7aff-4acb-81c6-02c344320562'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '23a8c0b7-7b9b-45c2-9c09-82663f310bbf'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '2ccb0257-8f09-43fa-99c0-de7de8399265'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '2d0ec878-0568-4772-ac36-bee73e4c030d'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '2d114b71-afb6-45f8-bfdd-66ded9a428dd'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '379477c7-6209-4c30-b133-0a55fe449d1b'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '39a40902-e654-4239-b7f1-7f697f57bca1'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '4b6ad4b3-5e1d-49b0-b89c-0e69546f795a'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '5a1d6a21-5e4b-468a-9f57-948d6f6a690a'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '5b01e8c4-ffe0-48f7-b25a-edc28a9fca52'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '5b09e5c0-f089-4722-b81d-ff7987ed30fa'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '66a37875-b715-4c3d-a537-5c8341a5ee94'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '764f7d8e-29ea-44f5-b5e8-3037c00b776d'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '8409fbac-6cae-4882-a4de-4961f8bc75ef'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '84aba907-80d7-424b-be88-9bfbce30c121'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '88a4587d-c28b-458c-9c96-080ed7589606'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '8ac923f2-4c12-4fd0-b9be-a42f02ac6190'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '8f77f492-3f95-4b5d-9adc-a3f4c773201b'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '94e36ed3-8366-4c03-a14c-de88eeff0173'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '9e9f10d6-f203-479b-a86e-161181bb4d8d'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '9ed04580-cf7b-427c-9fd1-8efae95cde88'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', '9f871792-0309-4f83-96b0-daa1943502d3'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'a2d8344e-3c32-44fa-a19e-4e204f523477'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'a361cb03-ecc3-4884-bd0f-02f660519d98'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'a60f860e-b097-4a37-a9ec-6ad128d87ac7'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'a8556a2f-af16-4ae9-bc48-8b84689d408c'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'aa2529bd-9962-4855-a935-43d2fb905781'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'abe50035-ecb9-4040-b31d-0a34c595db39'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'ba41cf88-7857-43d6-b788-ec6348d86319'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'ba697aaf-1190-493d-99bd-fa7fc073eb97'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'c0717a92-e8d6-4c3e-a32f-2e9d0fe63b96'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'd28a933f-ab1a-4476-9920-22d96bfcf9c2'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'e1ba8ebb-e58e-4a0c-8ec4-4557efedcfe8'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'e4a06bdb-5e0d-4f70-ba98-31bac393ba17'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'e5494369-bd45-4d9e-b889-ffa292335517'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'ea54c070-6a3c-4eaa-a64b-29d6402f3136'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'eafdf723-1fca-4ebe-9b26-fdfdd285228b'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'ee6d6ceb-9477-4175-9ac4-f1e0c7e1572a'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'f1a14d32-49bf-4fe7-8167-8100b9a3d9e9'),
	('051e5edd-b9a6-491a-9997-1812ad113fae', 'f2d88c12-07d8-45bb-b374-00098e513d67'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '182f199f-fc4b-4aa8-a5f4-a7f7e2d05515'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '2ccb0257-8f09-43fa-99c0-de7de8399265'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '2d0ec878-0568-4772-ac36-bee73e4c030d'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '2d114b71-afb6-45f8-bfdd-66ded9a428dd'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '4b6ad4b3-5e1d-49b0-b89c-0e69546f795a'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '5a1d6a21-5e4b-468a-9f57-948d6f6a690a'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '8409fbac-6cae-4882-a4de-4961f8bc75ef'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', '9e9f10d6-f203-479b-a86e-161181bb4d8d'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'a8556a2f-af16-4ae9-bc48-8b84689d408c'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'aa2529bd-9962-4855-a935-43d2fb905781'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'ba697aaf-1190-493d-99bd-fa7fc073eb97'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'c0717a92-e8d6-4c3e-a32f-2e9d0fe63b96'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'e1ba8ebb-e58e-4a0c-8ec4-4557efedcfe8'),
	('eb21c614-7a19-4296-83cc-0dd012e63a7d', 'ea54c070-6a3c-4eaa-a64b-29d6402f3136'),
	('f323a5ba-2a23-46b2-9bd8-7fa8bb36a03b', 'f09403d2-2e2b-4909-8361-983f7e243876')
ON CONFLICT DO NOTHING;

--
-- Migration bookkeeping. The timestamps are deliberately now(): they record when
-- THIS database was created, which is what they mean, rather than when the dump
-- was taken on someone else's machine.
--
INSERT INTO public.goose_db_version (version_id, is_applied, tstamp)
SELECT v, true, now()
  FROM (VALUES
          (0),
          (1),
          (2),
          (3),
          (4),
          (5),
          (6),
          (7),
          (24),
          (25),
          (26),
          (27),
          (28),
          (29),
          (30),
          (31),
          (32),
          (33),
          (34),
          (35),
          (36),
          (37),
          (38),
          (39),
          (40),
          (41),
          (42),
          (43),
          (44),
          (45),
          (46),
          (47),
          (48),
          (49),
          (50),
          (51)
       ) AS t(v)
 WHERE NOT EXISTS (SELECT 1 FROM public.goose_db_version g WHERE g.version_id = t.v)
 -- ORDER BY is not decoration: goose reports the CURRENT version by reading the
 -- highest id, not the highest version_id. Without this Postgres hands out ids in
 -- whatever order it pleases and goose announces some arbitrary middle migration
 -- as current. It still runs nothing, but the number it prints is a lie.
 ORDER BY t.v;

SELECT setval(
         pg_get_serial_sequence('public.goose_db_version', 'id'),
         GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.goose_db_version), 1));

COMMIT;

--
-- THE TEAM.
--
-- ⚠ EVERY ONE OF THESE ACCOUNTS SHARES ONE PASSWORD, AND THAT PASSWORD IS IN
--   VERSION CONTROL. It is a way IN, not a way to stay. Change each one from
--   the console the first time you sign in, before the site is reachable from
--   the internet. Anybody who can read this repository can read these accounts.
--
-- The hashes are argon2id, produced by the application's own
-- crypto.HashPassword (src/backend/internal/platform/crypto/password.go) — the
-- only thing that produces an encoding this build can verify. Four different
-- hashes of the same password is correct: each carries its own salt.
--
-- full_name here is the SHORT form — what the console prints in the top bar,
-- in an activity row and against a draft. Four people who work together read
-- "Trung Lê" faster than "Lê Đức Trung", and the console is where they spend
-- the day. The public roster below carries the full name instead; the two are
-- different on purpose, not out of sync.
--
INSERT INTO public.users (email, password_hash, full_name, status, email_verified_at)
VALUES
  ('trungld@zakutek.com',
   '$argon2id$v=19$m=65536,t=3,p=2$Iw5kdaQnxc1XWVB/+VEBIA$5eVwzsqeUzzoSR8U0/eETWJPNCycwQCvBkQo9gbl8n8',
   'Trung Lê', 'active', now()),
  ('nhat@zakutek.com',
   '$argon2id$v=19$m=65536,t=3,p=2$FpOFvo5XaRCHufaoN2b4SA$Z9GcOfDymm1lTgAHL/ZVBr9x1OOEdQkN6wYw4+vrPCs',
   'Nhật Nguyễn', 'active', now()),
  ('linh@zakutek.com',
   '$argon2id$v=19$m=65536,t=3,p=2$Coo2RngINTiRzYocpj/fPA$j2iVQMu+Jd/H6uQA/l32YuLuAVT3/LKEFIJCRdJoenw',
   'Linh Nguyễn', 'active', now()),
  ('tiennv@zakutek.com',
   '$argon2id$v=19$m=65536,t=3,p=2$Rz0JEv8z+WaDLUCOcDINTA$F4XxhdLWbkTTq0xTXa+gNjZPnVefXCpplXmYlHPNE1s',
   'Tiến Nguyễn', 'active', now())
ON CONFLICT (email) DO NOTHING;

-- One role each. The grants themselves live in role_permissions above, so a
-- change to what "editor" may do reaches these four without touching this file.
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM public.users u
  JOIN (VALUES
          ('trungld@zakutek.com', 'admin'),
          ('nhat@zakutek.com', 'editor'),
          ('linh@zakutek.com', 'editor'),
          ('tiennv@zakutek.com', 'editor')
       ) AS a(email, role_code) ON a.email = u.email::text
  JOIN public.roles r ON r.code = a.role_code
ON CONFLICT DO NOTHING;

--
-- The same four as public team members.
--
-- `members` has no foreign key to `users`: a person on the public roster need
-- not have a login, and someone with a login need not be shown on the site. The
-- two are kept in step by hand, which is why they are seeded together here.
--
-- full_name here is the FULL name, because this is the public profile: a
-- visitor reading the team page has no idea who "Trung Lê" is, and a name is
-- the one thing a profile cannot abbreviate.
--
-- Everything else — role, bio, photo, skills, links, order — is left empty for
-- the console to fill. is_active defaults to true, so all four appear on the
-- site's team section as soon as it reads them.
--
-- `display_name` is deliberately left unset here.
--
-- It is the name the public site shows, and nobody but the team can decide
-- what each person wants to be called in public — inventing one would be
-- putting words in their mouth. Until it is filled in, the site falls back to
-- full_name, which means A FRESH INSTALL SHOWS REAL NAMES. Set it from the
-- console (Thành viên → Tên hiển thị trên site) before the site is reachable,
-- or accept that. See migration 0051.
INSERT INTO public.members (slug, full_name, email, sort_order)
VALUES
  ('trungld', 'Lê Đức Trung', 'trungld@zakutek.com', 0),
  ('nhat', 'Nhật Nguyễn', 'nhat@zakutek.com', 1),
  ('linh', 'Nguyễn Phan Hoàng Linh', 'linh@zakutek.com', 2),
  ('tiennv', 'Nguyễn Văn Tiến', 'tiennv@zakutek.com', 3)
ON CONFLICT (slug) DO NOTHING;

--
-- THE HOME PAGE.
--
-- The public site's "/" is a CMS page whose landing owns eight sections, and
-- the console edits every one of them. Without these rows a fresh install still
-- serves a home page — the site falls back to the same eight sections built
-- into its code — but nobody can change a word of it without a deploy, which
-- is the whole point of putting it here.
--
-- The three pieces have to arrive together:
--   cms_landing_pages / _sections   what the page is made of
--   cms_pages                       the page that hosts the landing
--   system_settings                 cms.home_page_slug, which points "/" at it
--
-- The section configs below are the copy the site shipped with, lifted out of
-- the components so an editor can change it. Rendered with these values the
-- page is pixel-identical to the built-in fallback — that is how they were
-- checked.
--

INSERT INTO public.cms_landing_pages (id, key, name, status, published_snapshot)
VALUES ('7e586b2f-3d33-4478-82bd-c16613d5275a', 'trang-chu', 'Trang chủ', 'published', E'{"key": "trang-chu", "seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "name": "Trang chủ", "og_path": null, "sections": [{"id": "4c1dd11a-dd98-411a-a4ff-db711648a8c9", "type": "hero", "config": {"eyebrow": "HỆ SINH THÁI SẢN PHẨM ZUKATEK", "heading": "Sản phẩm số\\ncho công việc của bạn.", "subheading": "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."}, "sort_order": 0}, {"id": "d87c6149-d803-4589-a738-31f22c7a5e46", "type": "audience_picker", "config": {"items": [{"key": "individual", "body": "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.", "label": "Cá nhân", "cta_href": "/#contact", "headline": "Dành cho cá nhân", "cta_label": "Tư vấn cho cá nhân "}, {"key": "group", "body": "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.", "label": "Nhóm", "cta_href": "/#contact", "headline": "Dành cho nhóm", "cta_label": "Tư vấn cho nhóm "}, {"key": "business", "body": "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.", "label": "Doanh nghiệp", "cta_href": "/#contact", "headline": "Dành cho doanh nghiệp", "cta_label": "Tư vấn cho doanh nghiệp "}], "title": "Sản phẩm phù hợp với nhu cầu của bạn", "subtitle": "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."}, "sort_order": 1}, {"id": "eff1940f-2e77-45d2-9588-61c890ef01ee", "type": "product_grid", "config": {"limit": 6, "title": "Sản phẩm của ZUKATEK", "category": "", "subtitle": "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.", "show_all_href": "/products", "show_all_label": "Xem tất cả sản phẩm "}, "sort_order": 2}, {"id": "ee788422-eca8-441e-86be-201dbd07397b", "type": "team", "config": {"limit": 0, "title": "Đội ngũ phát triển", "subtitle": "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek."}, "sort_order": 3}, {"id": "b208a676-2c13-4d07-bedb-b3d6a1803911", "type": "buying_steps", "config": {"steps": [{"body": "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.", "title": "Chọn sản phẩm"}, {"body": "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.", "title": "Trải nghiệm bản demo"}, {"body": "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.", "title": "Liên hệ mua sản phẩm"}], "title": "Chọn mua sản phẩm ZUKATEK", "subtitle": "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}, "sort_order": 4}, {"id": "6fd9afba-1161-4626-b3ed-bba424027a53", "type": "featured_articles", "config": {"limit": 3, "filters": {}}, "sort_order": 5}, {"id": "77f50406-e967-4c5c-a466-83923c0f249a", "type": "faq", "config": {"items": [{"question": "Sản phẩm của ZUKATEK dành cho ai?", "answer_html": "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."}, {"question": "Tôi có thể trải nghiệm trước khi mua không?", "answer_html": "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."}, {"question": "Làm thế nào để tìm hiểu kỹ năng của team?", "answer_html": "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ &amp; kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."}, {"question": "Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?", "answer_html": "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."}], "title": "Câu hỏi thường gặp", "eyebrow": "TÌM HIỂU THÊM", "subtitle": "Những thông tin cần biết trước khi chọn mua sản phẩm."}, "sort_order": 6}, {"id": "9aca499b-d1f8-474e-8b99-58f42ab35364", "type": "contact_form", "config": {"note": "", "zalo": "", "email": "", "title": "Cần tư vấn sản phẩm?\\nLiên hệ ZUKATEK.", "subtitle": "Nhận tư vấn về tính năng, giá và cách triển khai\\ntừ người giới thiệu hoặc đội ngũ ZUKATEK."}, "sort_order": 7}]}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- The eight sections, in the order the page shows them.
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config) VALUES

  ('4c1dd11a-dd98-411a-a4ff-db711648a8c9', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'hero', 0, 't', E'{"eyebrow": "HỆ SINH THÁI SẢN PHẨM ZUKATEK", "heading": "Sản phẩm số\\ncho công việc của bạn.", "subheading": "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."}'::jsonb),
  ('d87c6149-d803-4589-a738-31f22c7a5e46', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'audience_picker', 1, 't', '{"items": [{"key": "individual", "body": "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.", "label": "Cá nhân", "cta_href": "/#contact", "headline": "Dành cho cá nhân", "cta_label": "Tư vấn cho cá nhân "}, {"key": "group", "body": "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.", "label": "Nhóm", "cta_href": "/#contact", "headline": "Dành cho nhóm", "cta_label": "Tư vấn cho nhóm "}, {"key": "business", "body": "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.", "label": "Doanh nghiệp", "cta_href": "/#contact", "headline": "Dành cho doanh nghiệp", "cta_label": "Tư vấn cho doanh nghiệp "}], "title": "Sản phẩm phù hợp với nhu cầu của bạn", "subtitle": "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."}'::jsonb),
  ('eff1940f-2e77-45d2-9588-61c890ef01ee', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'product_grid', 2, 't', '{"limit": 6, "title": "Sản phẩm của ZUKATEK", "category": "", "subtitle": "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.", "show_all_href": "/products", "show_all_label": "Xem tất cả sản phẩm "}'::jsonb),
  ('ee788422-eca8-441e-86be-201dbd07397b', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'team', 3, 't', '{"limit": 0, "title": "Đội ngũ phát triển", "subtitle": "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek."}'::jsonb),
  ('b208a676-2c13-4d07-bedb-b3d6a1803911', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'buying_steps', 4, 't', '{"steps": [{"body": "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.", "title": "Chọn sản phẩm"}, {"body": "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.", "title": "Trải nghiệm bản demo"}, {"body": "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.", "title": "Liên hệ mua sản phẩm"}], "title": "Chọn mua sản phẩm ZUKATEK", "subtitle": "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}'::jsonb),
  ('6fd9afba-1161-4626-b3ed-bba424027a53', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'featured_articles', 5, 't', '{"limit": 3, "filters": {}}'::jsonb),
  ('77f50406-e967-4c5c-a466-83923c0f249a', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'faq', 6, 't', '{"items": [{"question": "Sản phẩm của ZUKATEK dành cho ai?", "answer_html": "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."}, {"question": "Tôi có thể trải nghiệm trước khi mua không?", "answer_html": "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."}, {"question": "Làm thế nào để tìm hiểu kỹ năng của team?", "answer_html": "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ &amp; kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."}, {"question": "Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?", "answer_html": "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."}], "title": "Câu hỏi thường gặp", "eyebrow": "TÌM HIỂU THÊM", "subtitle": "Những thông tin cần biết trước khi chọn mua sản phẩm."}'::jsonb),
  ('9aca499b-d1f8-474e-8b99-58f42ab35364', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'contact_form', 7, 't', E'{"note": "", "zalo": "", "email": "", "title": "Cần tư vấn sản phẩm?\\nLiên hệ ZUKATEK.", "subtitle": "Nhận tư vấn về tính năng, giá và cách triển khai\\ntừ người giới thiệu hoặc đội ngũ ZUKATEK."}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- The CMS page that hosts it, and the setting that makes it the site root.
INSERT INTO public.cms_pages (id, title, slug, status, landing_id, published_at, published_snapshot)
SELECT '6f6ac11c-85b9-4443-82c5-9e9f84eaf398', 'Trang chủ', 'trang-chu', 'published', '7e586b2f-3d33-4478-82bd-c16613d5275a', now(), '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.cms_pages WHERE slug = 'trang-chu');


INSERT INTO public.system_settings (key, value) VALUES ('cms.home_page_slug', '"trang-chu"'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- The published read model the public page endpoint serves from.

INSERT INTO public.published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at, written_at)
VALUES ('page', 'en', 'trang-chu', '6f6ac11c-85b9-4443-82c5-9e9f84eaf398', 't', 'Trang chủ', '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}'::jsonb, now(), now())
ON CONFLICT (entity, locale, slug) DO NOTHING;
INSERT INTO public.published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at, written_at)
VALUES ('page', 'vi', 'trang-chu', '6f6ac11c-85b9-4443-82c5-9e9f84eaf398', 't', 'Trang chủ', '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}'::jsonb, now(), now())
ON CONFLICT (entity, locale, slug) DO NOTHING;


--
-- THE NAVIGATION.
--
-- The site's header and footer are not markup any more: the links are menu
-- items, the words around them are site.* settings, and both are edited in the
-- console. A fresh install without these rows still renders a header and a
-- footer — the site falls back to the copy built into its components — but
-- nothing in them can be changed without a deploy.
--
-- Two slots, because the site has two lists:
--   header   the bar, shared by desktop and phone; an item with children is a
--            dropdown on a wide screen and an indented entry on a narrow one
--   footer   one root per column; the root is the heading, its children are
--            the links under it
--
-- There was a third, `header_mobile`, until migration 0048 removed it: one
-- menu both layouts read is one place to edit instead of two that drift.
--
-- The ids are fixed rather than generated, so a second run of this file changes
-- nothing and a child always finds its parent. Rendered from these rows the two
-- components produce byte-identical markup to the built-in fallback — that is
-- how they were checked.
--

INSERT INTO public.cms_menus (id, name, location) VALUES ('015d00b2-c6b2-4dac-8627-860e4045038d', 'Footer', 'footer')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menus (id, name, location) VALUES ('b1116a4e-5b94-4481-8b1e-02984c7752e0', 'Header', 'header')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('569513ef-f1fe-462c-92eb-69099edb0fec', '015d00b2-c6b2-4dac-8627-860e4045038d', NULL, 'Khám phá ZUKATEK', NULL, 'internal', '/', 'f', 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('515d8f42-b654-4d8f-a69a-80fd0a51808c', '015d00b2-c6b2-4dac-8627-860e4045038d', NULL, 'Mua & sử dụng sản phẩm', NULL, 'internal', '/', 'f', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('6ceed0ac-e5e5-4319-902a-44c8c6bbf100', '015d00b2-c6b2-4dac-8627-860e4045038d', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'Cách mua sản phẩm', NULL, 'internal', '/#collaboration', 'f', 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('25f8e38c-293a-4fe9-914b-bda04de40262', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Về ZUKATEK', NULL, 'internal', '/#about', 'f', 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('82fb6df5-e4b0-4c28-8cd8-ee60c610d7ee', '015d00b2-c6b2-4dac-8627-860e4045038d', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'Liên hệ', NULL, 'internal', '/#contact', 'f', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('40dbc66b-7dd3-4b21-b3e0-ef672d0c6c62', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Sản phẩm', NULL, 'internal', '/#products', 'f', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('bfb9d4a8-ffed-445f-95ea-7891c3c8a096', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Đội ngũ & kỹ năng', NULL, 'internal', '/#team', 'f', 2) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('42f51025-8af8-469a-ab48-fbae0e80acaa', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Blog', NULL, 'internal', '/blog', 'f', 3) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('ea87508e-75d6-4471-aaf4-16fc37cb28b2', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Khám phá', NULL, 'internal', '/', 'f', 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('8e1b15b9-cd81-4991-8d31-b0f26992d206', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Sản phẩm', NULL, 'internal', '/products', 'f', 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('33bea0b9-5334-4655-9b60-82996a76959f', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Đội ngũ & kỹ năng', NULL, 'internal', '/#team', 'f', 2) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('a824d7a3-70cc-454e-99d9-11d8b1829621', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Blog', NULL, 'internal', '/blog', 'f', 3) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('74699bed-b2f4-429b-874e-bc5676a3bd50', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', 'ea87508e-75d6-4471-aaf4-16fc37cb28b2', 'Sản phẩm', 'Danh mục, tính năng và bản trải nghiệm', 'internal', '/products', 'f', 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, description, link_type, url, open_new_tab, sort_order)
VALUES ('8cf85720-6768-421d-a491-f8b66a328eba', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', 'ea87508e-75d6-4471-aaf4-16fc37cb28b2', 'Đội ngũ & kỹ năng', 'Con người đứng sau ZUKATEK', 'internal', '/#team', 'f', 1) ON CONFLICT (id) DO NOTHING;


-- The words beside those links. Empty would mean "use the site's built-in
-- copy", which is also correct — they are seeded with the real text so the
-- console shows an editor what the page actually says instead of a blank box.
INSERT INTO public.system_settings (key, value) VALUES
  ('site.brand_tagline', '"Đội ngũ phát triển sản phẩm số\ncho cá nhân, nhóm và doanh nghiệp."'::jsonb),
  ('site.footer_copyright', '"© {year} ZUKATEK"'::jsonb)
ON CONFLICT (key) DO NOTHING;


--
-- THE SITE IN ENGLISH.
--
-- Vietnamese is the source language and lives in the rows above; this is the
-- English copy of the same things, stored the way every translation in this
-- system is stored — keyed by (entity, entity_id, locale), overlaid at read
-- time, and falling back to Vietnamese field by field.
--
-- Three kinds of row, which is every kind the public site reads:
--   menu_item        a link's label, and the line under it in the dropdown
--   site_chrome      the words around the navigation (one record, fixed id)
--   landing_section  the home page's own copy, as a partial config
--
-- Turning the switch off (translation.enabled) hides all of it without
-- deleting anything: the site serves Vietnamese and keeps this for the day it
-- is turned back on.
--

INSERT INTO public.translations (entity, entity_id, locale, values) VALUES
('menu_item', 'ea87508e-75d6-4471-aaf4-16fc37cb28b2', 'en', '{"label": "Explore"}'::jsonb),
  ('menu_item', '40dbc66b-7dd3-4b21-b3e0-ef672d0c6c62', 'en', '{"label": "Products", "description": "The catalogue, the features and the demos"}'::jsonb),
  ('menu_item', '8e1b15b9-cd81-4991-8d31-b0f26992d206', 'en', '{"label": "Products", "description": "The catalogue, the features and the demos"}'::jsonb),
  ('menu_item', '74699bed-b2f4-429b-874e-bc5676a3bd50', 'en', '{"label": "Products", "description": "The catalogue, the features and the demos"}'::jsonb),
  ('menu_item', 'e3dc524f-9a01-432a-a97e-4b79335d10b5', 'en', '{"label": "Products", "description": "The catalogue, the features and the demos"}'::jsonb),
  ('menu_item', 'bfb9d4a8-ffed-445f-95ea-7891c3c8a096', 'en', '{"label": "Team & skills", "description": "The people behind ZUKATEK"}'::jsonb),
  ('menu_item', '33bea0b9-5334-4655-9b60-82996a76959f', 'en', '{"label": "Team & skills", "description": "The people behind ZUKATEK"}'::jsonb),
  ('menu_item', '8cf85720-6768-421d-a491-f8b66a328eba', 'en', '{"label": "Team & skills", "description": "The people behind ZUKATEK"}'::jsonb),
  ('menu_item', 'e069ab0b-e734-4b0d-8e24-c0826f30ce8e', 'en', '{"label": "Team & skills", "description": "The people behind ZUKATEK"}'::jsonb),
  ('menu_item', '42f51025-8af8-469a-ab48-fbae0e80acaa', 'en', '{"label": "Blog"}'::jsonb),
  ('menu_item', 'a824d7a3-70cc-454e-99d9-11d8b1829621', 'en', '{"label": "Blog"}'::jsonb),
  ('menu_item', '2fb8d37e-e9ac-48b5-8ccb-12177fcb7441', 'en', '{"label": "Blog"}'::jsonb),
  ('menu_item', '6ceed0ac-e5e5-4319-902a-44c8c6bbf100', 'en', '{"label": "How to buy"}'::jsonb),
  ('menu_item', '569513ef-f1fe-462c-92eb-69099edb0fec', 'en', '{"label": "Explore ZUKATEK"}'::jsonb),
  ('menu_item', '25f8e38c-293a-4fe9-914b-bda04de40262', 'en', '{"label": "About ZUKATEK"}'::jsonb),
  ('menu_item', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'en', '{"label": "Buying & using products"}'::jsonb),
  ('menu_item', '82fb6df5-e4b0-4c28-8cd8-ee60c610d7ee', 'en', '{"label": "Contact"}'::jsonb),
  ('site_chrome', '00000000-0000-0000-0000-00005174e000', 'en', '{"brand_tagline": "A team building digital products\nfor individuals, teams and companies.", "footer_copyright": "© {year} ZUKATEK"}'::jsonb),
('landing_section', '4c1dd11a-dd98-411a-a4ff-db711648a8c9', 'en', '{"config": {"eyebrow": "THE ZUKATEK PRODUCT ECOSYSTEM", "heading": "Digital products\nfor the work you do.", "subheading": "ZUKATEK builds and delivers digital products for individuals, teams, small businesses and companies. Explore the features, try a product and get advice on the right fit."}}'::jsonb),
  ('landing_section', 'd87c6149-d803-4589-a738-31f22c7a5e46', 'en', '{"config": {"title": "Products that match the way you work", "subtitle": "Digital products for personal work, for working together in a team, and for running a company.", "items": [{"label": "Individuals", "headline": "For individuals", "body": "Tools for everyday work: taking notes, keeping information in order and staying on top of your own tasks.", "cta_label": "Advice for individuals "}, {"label": "Teams", "headline": "For teams", "body": "Products that help a team organise its work, share documents and follow progress in one place.", "cta_label": "Advice for teams "}, {"label": "Companies", "headline": "For companies", "body": "Products for managing and running a business. Check the features, the scope and the cost before you buy.", "cta_label": "Advice for companies "}]}}'::jsonb),
  ('landing_section', 'eff1940f-2e77-45d2-9588-61c890ef01ee', 'en', '{"config": {"title": "ZUKATEK products", "subtitle": "Explore the features, open a demo and ask for advice about the product you have in mind.", "show_all_label": "See every product "}}'::jsonb),
  ('landing_section', 'ee788422-eca8-441e-86be-201dbd07397b', 'en', '{"config": {"title": "The team behind them", "subtitle": "The people who build and develop Zukatek''s products."}}'::jsonb),
  ('landing_section', 'b208a676-2c13-4d07-bedb-b3d6a1803911', 'en', '{"config": {"title": "Buying a ZUKATEK product", "subtitle": "Three steps to the product that fits what you need.", "steps": [{"title": "Choose a product", "body": "Browse the catalogue, the features and who each product is for, and find the right one."}, {"title": "Try the demo", "body": "Open the product''s own trial and check the features you actually need."}, {"title": "Get in touch to buy", "body": "Ask about pricing, scope and rollout — from the person who referred you or from ZUKATEK."}]}}'::jsonb),
  ('landing_section', '77f50406-e967-4c5c-a466-83923c0f249a', 'en', '{"config": {"eyebrow": "GOOD TO KNOW", "title": "Frequently asked questions", "subtitle": "What to know before choosing a product.", "items": [{"question": "Who are ZUKATEK''s products for?", "answer_html": "ZUKATEK builds digital products for individuals, teams and companies. Each product has its own audience, features and scope, so you can pick the one that fits."}, {"question": "Can I try a product before buying it?", "answer_html": "Products with a demo show a “Try it” button that opens their own trial, and the detail page explains how to use it. The catalogue currently uses sample data and placeholder links to show the layout."}, {"question": "How can I learn what the team does?", "answer_html": "Every member has a profile under “The team”. Their role, their skills and the products they work on are listed there."}, {"question": "Who do I contact about pricing or buying?", "answer_html": "Contact whoever sent you this ZUKATEK profile, or ZUKATEK directly. Tell us which product interests you, how many people will use it and how you plan to roll it out."}]}}'::jsonb),
  ('landing_section', '9aca499b-d1f8-474e-8b99-58f42ab35364', 'en', '{"config": {"title": "Need advice on a product?\nTalk to ZUKATEK.", "subtitle": "Ask about features, pricing and rollout\nfrom your referrer or from the ZUKATEK team."}}'::jsonb)
ON CONFLICT (entity, entity_id, locale) DO NOTHING;


-- The site offers a second language. Set enabled to false for a Vietnamese-only
-- install; add codes to the list (en,ja) to offer more, once their text exists.
INSERT INTO public.system_settings (key, value) VALUES
  ('translation.enabled', 'true'::jsonb),
  ('translation.locales', '"en"'::jsonb)
ON CONFLICT (key) DO NOTHING;
