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
--   NOTHING and goose will see version 40 and skip — but (b) alone is simpler
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
	('ed5d8701-4bc1-47f5-a51d-26a3b5c3f6cf', 'super_admin', 'Super Admin', 'Full access (wildcard)', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'admin', 'Admin', 'Platform administration', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'editor', 'Editor', 'Self-service baseline', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07')
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions (id, code, description, created_at) VALUES
	('5bcf56d7-001f-4c94-95e6-d59eb020313b', '*', 'Wildcard — all permissions', '2026-10-13 15:59:56.123828+07'),
	('97b0cdb9-be35-4c50-a2e0-280af3289b4e', 'users.read', 'View users', '2026-10-13 15:59:56.123828+07'),
	('7b862e6a-0252-46bb-bee2-9ed175d0c69a', 'users.create', 'Create users', '2026-10-13 15:59:56.123828+07'),
	('2b155955-6002-44f8-b565-71ad2ed7441a', 'users.update', 'Update users', '2026-10-13 15:59:56.123828+07'),
	('f9d1c109-c296-4b01-94f4-39316fa3d383', 'users.delete', 'Delete/disable users', '2026-10-13 15:59:56.123828+07'),
	('92b1fecd-4633-413b-a067-224497dac5e4', 'users.assign_role', 'Assign/remove roles', '2026-10-13 15:59:56.123828+07'),
	('ee9ed43d-d7fa-4092-b484-76c1a4bc5053', 'roles.read', 'View roles and their permissions', '2026-10-13 15:59:56.123828+07'),
	('55a99309-1abd-4dd3-959a-f86446cfecfe', 'roles.manage', 'Create/update/delete roles, assign permissions', '2026-10-13 15:59:56.123828+07'),
	('51b5dded-bc08-4aff-8a62-9402125a85a4', 'permissions.read', 'View permission catalog', '2026-10-13 15:59:56.123828+07'),
	('0a57cd83-9cad-43ef-99d4-fd121a910268', 'sessions.read', 'View other users'' sessions', '2026-10-13 15:59:56.123828+07'),
	('97f19070-e893-4315-a8c5-be5889b931ae', 'sessions.revoke', 'Revoke other users'' sessions', '2026-10-13 15:59:56.123828+07'),
	('29121c60-a322-4c99-b419-1b88c74bbcd0', 'settings.read', 'Read system settings', '2026-10-13 15:59:56.123828+07'),
	('727d20bd-4dd6-460d-ba9b-189e58514b91', 'settings.manage', 'Update system settings', '2026-10-13 15:59:56.123828+07'),
	('6f021fb0-c042-4504-b7d8-eaaec8fce987', 'impersonation.start', 'Impersonate another user', '2026-10-13 15:59:56.123828+07'),
	('a326b5d1-c570-4da1-8ded-8173e01ebcdc', 'cms.article.view', 'View articles (editor: own only)', '2026-10-13 15:59:56.457109+07'),
	('10780841-b62d-4f0c-97c5-2fcd673b2c0a', 'cms.article.create', 'Create articles', '2026-10-13 15:59:56.457109+07'),
	('6ecbcca9-2a3a-4900-8a81-9ca9589ef081', 'cms.article.edit', 'Edit articles', '2026-10-13 15:59:56.457109+07'),
	('7484ae94-a81f-45ec-a42a-cb867fc30c01', 'cms.article.delete', 'Delete articles', '2026-10-13 15:59:56.457109+07'),
	('63f301bd-3d99-47bc-bfc9-cacc878f56b1', 'cms.article.submit', 'Submit articles for review', '2026-10-13 15:59:56.457109+07'),
	('17326241-70e1-4863-93b5-3f4ee29ef0a3', 'cms.article.review', 'Approve/reject articles pending review', '2026-10-13 15:59:56.457109+07'),
	('7c12b53b-6c0e-4c65-a7d1-3e83c9ce92d6', 'cms.article.publish', 'Publish / schedule / unpublish / re-publish articles', '2026-10-13 15:59:56.457109+07'),
	('1143858a-4f7a-4aeb-afde-08981f4e4b46', 'cms.page.view', 'View static pages', '2026-10-13 15:59:56.457109+07'),
	('9ad8a4ac-fe71-4f83-a527-de031be730f0', 'cms.page.create', 'Create static pages', '2026-10-13 15:59:56.457109+07'),
	('9b697e28-7cb0-4713-a453-37bb8138a9ec', 'cms.page.edit', 'Edit static pages', '2026-10-13 15:59:56.457109+07'),
	('50bf40b4-e641-49be-81fc-21287e80360a', 'cms.page.delete', 'Delete static pages', '2026-10-13 15:59:56.457109+07'),
	('e28b233d-cccc-4f88-b8a1-f105d0f001e2', 'cms.page.publish', 'Publish/unpublish static pages', '2026-10-13 15:59:56.457109+07'),
	('b4d08f37-eeeb-4834-9cd3-8c4c1c493197', 'cms.taxonomy.manage', 'Create/update/delete categories and tags', '2026-10-13 15:59:56.457109+07'),
	('340d0a72-c41a-4966-845c-6cb19a83a08e', 'cms.menu.manage', 'Manage navigation menus', '2026-10-13 15:59:56.457109+07'),
	('75f4407e-953b-4a08-81b0-4c8890e43175', 'cms.comment.moderate', 'Moderate comments', '2026-10-13 15:59:56.457109+07'),
	('48338bb9-4216-4534-a8f1-2a7e3b8ba408', 'cms.landing.manage', 'Manage landing pages', '2026-10-13 15:59:56.457109+07'),
	('59d7d58c-b96b-45ff-8d0c-c576ebe550ba', 'cms.settings.read', 'Read CMS feature flags', '2026-10-13 15:59:56.457109+07'),
	('d128ec91-4126-471a-839f-0577af60f8d1', 'cms.settings.manage', 'Update CMS feature flags', '2026-10-13 15:59:56.457109+07'),
	('7766ccff-ff6e-475a-a475-1718fd9e31d3', 'cms.newsletter.manage', 'Manage newsletter subscribers', '2026-10-13 15:59:56.615081+07'),
	('31616395-1701-41be-960b-269d32eb9ad3', 'members.view', 'View team member profiles', '2026-10-13 15:59:56.618432+07'),
	('ebcd91b4-a908-436f-9a7e-4fda12dbc71f', 'members.manage', 'Create/update/delete team member profiles', '2026-10-13 15:59:56.618432+07'),
	('9854973a-1185-4d7f-80fd-a89401592715', 'products.view', 'View products and product categories', '2026-10-13 15:59:56.630187+07'),
	('01bffe73-6026-4b60-9bb6-7c182e4ddb69', 'products.category.manage', 'Create/update/delete product categories', '2026-10-13 15:59:56.630187+07'),
	('e3ba7647-7fe9-4f0b-818b-7dd9f599228b', 'products.create', 'Create products', '2026-10-13 15:59:56.64574+07'),
	('e219fd2c-b6e2-41a7-8769-39a2cb14c0a2', 'products.edit', 'Edit products', '2026-10-13 15:59:56.64574+07'),
	('ac401418-23f2-4067-bbff-2b3d131082d7', 'products.delete', 'Delete products', '2026-10-13 15:59:56.64574+07'),
	('65eef7f4-43bd-4828-9933-b614e2b9a36f', 'products.publish', 'Publish / unpublish / archive products', '2026-10-13 15:59:56.64574+07'),
	('c8833b7c-a983-4820-bc70-a987c31f8993', 'crm.leads.view', 'View leads assigned to you and the shared queue', '2026-10-13 15:59:56.692191+07'),
	('bd73a29f-ef5d-4bd9-b6a0-c566b2138f4d', 'crm.leads.view_all', 'View every lead, including other people''s', '2026-10-13 15:59:56.692191+07'),
	('855e8c13-7a1e-4138-a2c8-2d46f4bcd35a', 'crm.leads.manage', 'Create, edit, assign and move leads', '2026-10-13 15:59:56.692191+07'),
	('f71d5cf1-26ec-4e50-a236-df26495c4612', 'ai.chat.handle', 'Read the assistant inbox and take over conversations', '2026-10-13 15:59:56.713479+07'),
	('c7ceeb02-96db-4ea3-a03f-11e82c9f052f', 'ai.mcp.use', 'Issue and use MCP tokens for agent access', '2026-10-13 15:59:56.74717+07'),
	('72933350-2e5b-4a1c-875d-c037ec8e1ee0', 'activity.read', 'Read the activity log', '2026-10-13 15:59:56.894851+07')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id) VALUES
	('ed5d8701-4bc1-47f5-a51d-26a3b5c3f6cf', '5bcf56d7-001f-4c94-95e6-d59eb020313b'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '97b0cdb9-be35-4c50-a2e0-280af3289b4e'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7b862e6a-0252-46bb-bee2-9ed175d0c69a'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '2b155955-6002-44f8-b565-71ad2ed7441a'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'f9d1c109-c296-4b01-94f4-39316fa3d383'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '92b1fecd-4633-413b-a067-224497dac5e4'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ee9ed43d-d7fa-4092-b484-76c1a4bc5053'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '55a99309-1abd-4dd3-959a-f86446cfecfe'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '51b5dded-bc08-4aff-8a62-9402125a85a4'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '0a57cd83-9cad-43ef-99d4-fd121a910268'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '97f19070-e893-4315-a8c5-be5889b931ae'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'a326b5d1-c570-4da1-8ded-8173e01ebcdc'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '10780841-b62d-4f0c-97c5-2fcd673b2c0a'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '6ecbcca9-2a3a-4900-8a81-9ca9589ef081'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7484ae94-a81f-45ec-a42a-cb867fc30c01'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '63f301bd-3d99-47bc-bfc9-cacc878f56b1'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '17326241-70e1-4863-93b5-3f4ee29ef0a3'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7c12b53b-6c0e-4c65-a7d1-3e83c9ce92d6'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '1143858a-4f7a-4aeb-afde-08981f4e4b46'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9ad8a4ac-fe71-4f83-a527-de031be730f0'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9b697e28-7cb0-4713-a453-37bb8138a9ec'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '50bf40b4-e641-49be-81fc-21287e80360a'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e28b233d-cccc-4f88-b8a1-f105d0f001e2'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'b4d08f37-eeeb-4834-9cd3-8c4c1c493197'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '340d0a72-c41a-4966-845c-6cb19a83a08e'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '75f4407e-953b-4a08-81b0-4c8890e43175'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '48338bb9-4216-4534-a8f1-2a7e3b8ba408'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '59d7d58c-b96b-45ff-8d0c-c576ebe550ba'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'd128ec91-4126-471a-839f-0577af60f8d1'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'a326b5d1-c570-4da1-8ded-8173e01ebcdc'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '10780841-b62d-4f0c-97c5-2fcd673b2c0a'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '6ecbcca9-2a3a-4900-8a81-9ca9589ef081'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '7484ae94-a81f-45ec-a42a-cb867fc30c01'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '63f301bd-3d99-47bc-bfc9-cacc878f56b1'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '75f4407e-953b-4a08-81b0-4c8890e43175'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '59d7d58c-b96b-45ff-8d0c-c576ebe550ba'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7766ccff-ff6e-475a-a475-1718fd9e31d3'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '31616395-1701-41be-960b-269d32eb9ad3'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ebcd91b4-a908-436f-9a7e-4fda12dbc71f'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '31616395-1701-41be-960b-269d32eb9ad3'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9854973a-1185-4d7f-80fd-a89401592715'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '01bffe73-6026-4b60-9bb6-7c182e4ddb69'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '9854973a-1185-4d7f-80fd-a89401592715'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e3ba7647-7fe9-4f0b-818b-7dd9f599228b'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e219fd2c-b6e2-41a7-8769-39a2cb14c0a2'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ac401418-23f2-4067-bbff-2b3d131082d7'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '65eef7f4-43bd-4828-9933-b614e2b9a36f'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'e3ba7647-7fe9-4f0b-818b-7dd9f599228b'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'e219fd2c-b6e2-41a7-8769-39a2cb14c0a2'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'c8833b7c-a983-4820-bc70-a987c31f8993'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'bd73a29f-ef5d-4bd9-b6a0-c566b2138f4d'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '855e8c13-7a1e-4138-a2c8-2d46f4bcd35a'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'c8833b7c-a983-4820-bc70-a987c31f8993'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '855e8c13-7a1e-4138-a2c8-2d46f4bcd35a'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'f71d5cf1-26ec-4e50-a236-df26495c4612'),
	('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'f71d5cf1-26ec-4e50-a236-df26495c4612'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'c7ceeb02-96db-4ea3-a03f-11e82c9f052f'),
	('7c5d683b-eb16-4d19-9243-5dc58ba56926', '72933350-2e5b-4a1c-875d-c037ec8e1ee0')
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
          (40)
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
VALUES ('7e586b2f-3d33-4478-82bd-c16613d5275a', 'trang-chu', 'Trang chủ', 'published', E'{"key": "trang-chu", "seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "name": "Trang chủ", "og_path": null, "sections": [{"type": "hero", "config": {"eyebrow": "HỆ SINH THÁI SẢN PHẨM ZUKATEK", "heading": "Sản phẩm số\\ncho công việc của bạn.", "subheading": "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."}, "sort_order": 0}, {"type": "audience_picker", "config": {"items": [{"key": "individual", "body": "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.", "label": "Cá nhân", "cta_href": "/#contact", "headline": "Dành cho cá nhân", "cta_label": "Tư vấn cho cá nhân "}, {"key": "group", "body": "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.", "label": "Nhóm", "cta_href": "/#contact", "headline": "Dành cho nhóm", "cta_label": "Tư vấn cho nhóm "}, {"key": "business", "body": "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.", "label": "Doanh nghiệp", "cta_href": "/#contact", "headline": "Dành cho doanh nghiệp", "cta_label": "Tư vấn cho doanh nghiệp "}], "title": "Sản phẩm phù hợp với nhu cầu của bạn", "subtitle": "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."}, "sort_order": 1}, {"type": "product_grid", "config": {"limit": 6, "title": "Sản phẩm của ZUKATEK", "category": "", "subtitle": "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.", "show_all_href": "/products", "show_all_label": "Xem tất cả sản phẩm "}, "sort_order": 2}, {"type": "team", "config": {"limit": 0, "title": "Đội ngũ phát triển", "subtitle": "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek."}, "sort_order": 3}, {"type": "buying_steps", "config": {"steps": [{"body": "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.", "title": "Chọn sản phẩm"}, {"body": "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.", "title": "Trải nghiệm bản demo"}, {"body": "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.", "title": "Liên hệ mua sản phẩm"}], "title": "Chọn mua sản phẩm ZUKATEK", "subtitle": "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}, "sort_order": 4}, {"type": "featured_articles", "config": {"limit": 3, "filters": {}}, "sort_order": 5}, {"type": "faq", "config": {"items": [{"question": "Sản phẩm của ZUKATEK dành cho ai?", "answer_html": "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."}, {"question": "Tôi có thể trải nghiệm trước khi mua không?", "answer_html": "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."}, {"question": "Làm thế nào để tìm hiểu kỹ năng của team?", "answer_html": "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ &amp; kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."}, {"question": "Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?", "answer_html": "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."}], "title": "Câu hỏi thường gặp", "eyebrow": "TÌM HIỂU THÊM", "subtitle": "Những thông tin cần biết trước khi chọn mua sản phẩm."}, "sort_order": 6}, {"type": "contact_form", "config": {"note": "", "zalo": "", "email": "", "title": "Cần tư vấn sản phẩm?\\nLiên hệ ZUKATEK.", "subtitle": "Nhận tư vấn về tính năng, giá và cách triển khai\\ntừ người giới thiệu hoặc đội ngũ ZUKATEK."}, "sort_order": 7}]}'::jsonb)
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
