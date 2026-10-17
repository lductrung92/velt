--
-- Zukatek: dữ liệu khởi tạo cho một database trống.
--
-- Đây là ẢNH CHỤP của velt_deploy, không phải định nghĩa thứ hai của dữ liệu.
-- Nạp theo đúng thứ tự này, vào một database MỚI:
--
--     psql -d <db> -v ON_ERROR_STOP=1 -f ddl.sql -f master_data.sql
--
-- Không nạp vào database đã dựng bằng goose migrate: ddl.sql đã mang sẵn các
-- hàng goose_db_version, hai nguồn sẽ đụng nhau.
--
-- ĐÃ CỐ Ý BỎ RA — ba thứ này là bí mật, không được nằm trong git:
--   ai_providers / ai_purpose_models   API key Groq + OpenRouter (đã mã hóa)
--   push_keys                          khóa riêng VAPID của Web Push
--   two_factor_secrets                 secret 2FA của từng người
--   system_settings.value_encrypted    secret reCAPTCHA (hàng vẫn còn, ruột NULL)
--
-- Hệ quả trên máy mới: nhà cung cấp AI và secret reCAPTCHA phải nhập lại trong
-- console. reCAPTCHA cố tình fail-closed — form liên hệ sẽ báo lỗi cho tới khi
-- secret được nhập, thay vì âm thầm bỏ qua kiểm tra.
--
-- Sinh lại bằng: deploy/sql/regenerate.sh
--
--
-- PostgreSQL database dump
--

\restrict YlCnRSvTpqXyQbykUME6AChWz4CQzyOF1g3GaGdCTMXI7KpqVaXVLWhkAuQ1W0d

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- (pg_dump 17+ phát ra 'SET transaction_timeout' ở đây; server production chạy-- Postgres 16 và không biết tham số này, nên nó bị gỡ. Giá trị 0 là mặc định,-- bỏ đi không đổi hành vi. regenerate.sh gỡ lại sau mỗi lần dump.)
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.activity_log DISABLE TRIGGER ALL;



ALTER TABLE public.activity_log ENABLE TRIGGER ALL;

--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.members DISABLE TRIGGER ALL;

INSERT INTO public.members (id, slug, full_name, role, bio, avatar_path, email, zalo, links, skills, sort_order, is_active, created_at, updated_at, display_name) VALUES ('646036e7-1950-4738-8c64-ceb1e59bc6bd', 'linh', 'Nguyễn Phan Hoàng Linh', 'Kỹ sư web', 'Phụ trách thứ khách hàng của bạn gặp đầu tiên: trang web. Một trang đẹp mà tải chậm trên mạng yếu thì phần lớn người xem sẽ không bao giờ thấy nó đẹp — nên Lynn làm việc nhiều với tốc độ, với cách trang hiển thị trên màn hình điện thoại, và với việc trang có được tìm thấy hay không khi ai đó gõ vào ô tìm kiếm. Phần đa ngôn ngữ cũng nằm ở đây: cùng một nội dung, đến được cả khách trong nước lẫn khách nước ngoài, mà không phải làm hai lần.', NULL, 'linh@zakutek.com', NULL, '[]', '["Tối ưu tốc độ", "SEO", "Thiết kế giao diện", "Đa ngôn ngữ", "Trải nghiệm người dùng"]', 3, true, '2026-10-16 10:03:42.483253+07', '2026-10-16 18:37:33.716623+07', 'Lynn');
INSERT INTO public.members (id, slug, full_name, role, bio, avatar_path, email, zalo, links, skills, sort_order, is_active, created_at, updated_at, display_name) VALUES ('8ea3e836-947e-4625-be51-5158816ed953', 'tiennv', 'Nguyễn Văn Tiến', 'Kỹ sư phần mềm', 'Làm phần bạn mở ra mỗi sáng: khu vực quản trị, nơi sản phẩm, nội dung và khách hàng được quản lý. Một phần mềm quản trị tốt không đo bằng số tính năng, mà bằng số lần bấm để xong một việc — và bằng chuyện lỡ tay rồi có quay lại được không. Ty để ý đúng những chi tiết đó: luồng thao tác ngắn lại, thông báo lỗi đọc là hiểu, và mọi thay đổi đều đi qua kiểm thử trước khi tới tay người dùng thật.', NULL, 'tiennv@zakutek.com', NULL, '[]', '["Giao diện quản trị", "Thiết kế luồng nghiệp vụ", "Trải nghiệm người dùng", "Kiểm thử tự động", "Tối ưu thao tác"]', 4, true, '2026-10-16 10:03:42.483253+07', '2026-10-16 18:37:33.722607+07', 'Ty');
INSERT INTO public.members (id, slug, full_name, role, bio, avatar_path, email, zalo, links, skills, sort_order, is_active, created_at, updated_at, display_name) VALUES ('7085ad1a-28b9-4a30-8c51-c3fadc16cb46', 'nhat', 'Nhật Nguyễn', 'Kỹ sư hệ thống', 'Giữ phần lõi của hệ thống — nơi mọi đơn hàng, mọi tài khoản và mọi thông tin khách hàng đi qua. Đây là phần không ai nhìn thấy, và cũng là phần người ta nhận ra ngay khi nó yếu: trang chờ mãi không tải, con số sai lệch sau một thao tác, hay một người xem được thứ lẽ ra không thuộc về họ. Nat dựng hệ thống để những chuyện đó không xảy ra, kể cả trong các tình huống khó: nhiều người cùng sửa một thứ, kết nối đứt giữa chừng, hay dữ liệu cũ phải chuyển sang cấu trúc mới mà hệ thống vẫn chạy.', NULL, 'nhat@zakutek.com', NULL, '[]', '["Kiến trúc hệ thống", "Xử lý dữ liệu", "Bảo mật & phân quyền", "Tối ưu hiệu năng", "Tích hợp hệ thống"]', 1, true, '2026-10-16 10:03:42.483253+07', '2026-10-16 19:08:22.753318+07', 'Nat');
INSERT INTO public.members (id, slug, full_name, role, bio, avatar_path, email, zalo, links, skills, sort_order, is_active, created_at, updated_at, display_name) VALUES ('066db29a-ec57-4ae0-9eec-940e1aa9578a', 'trungld', 'Lê Đức Trung', 'Kỹ sư AI', 'Phụ trách mảng AI và tự động hoá tại Zukatek, với một câu hỏi thường trực: việc nào nên để máy làm, việc nào nhất định phải có người. Tru đưa AI vào đúng những chỗ lặp đi lặp lại — trả lời khách ngoài giờ, chuyển nội dung sang ngôn ngữ khác, dựng bản nháp cho người viết — rồi dừng lại đúng lúc, trước khi sự tiện lợi biến thành một câu trả lời sai gửi tới khách hàng của bạn. Điều được để tâm nhiều nhất không phải máy làm được gì, mà làm với chi phí nào: một trợ lý trực suốt ngày đêm chỉ đáng giá khi nó rẻ hơn thứ nó thay thế.', 'members/066db29a-ec57-4ae0-9eec-940e1aa9578a/avatar-0b7b6a45-869b-46f7-b35a-17c2132bffb6.png', 'trungld@zakutek.com', NULL, '[]', '["Ứng dụng AI", "Tự động hoá quy trình", "Trợ lý ảo", "Xử lý nội dung", "Tích hợp hệ thống"]', 2, true, '2026-10-16 10:03:42.483253+07', '2026-10-16 18:37:33.709687+07', 'Tru');


ALTER TABLE public.members ENABLE TRIGGER ALL;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.users DISABLE TRIGGER ALL;

INSERT INTO public.users (id, email, password_hash, full_name, avatar_path, status, email_verified_at, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES ('d365846d-f064-405c-b0de-5ad6530fec26', 'nhat@zakutek.com', '$argon2id$v=19$m=65536,t=3,p=2$FpOFvo5XaRCHufaoN2b4SA$Z9GcOfDymm1lTgAHL/ZVBr9x1OOEdQkN6wYw4+vrPCs', 'Nhật Nguyễn', NULL, 'active', '2026-10-16 10:03:42.476348+07', 0, NULL, NULL, '2026-10-16 10:03:42.476348+07', '2026-10-16 10:03:42.476348+07');
INSERT INTO public.users (id, email, password_hash, full_name, avatar_path, status, email_verified_at, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES ('3ccbbabd-23cd-406e-9569-01829d6842a0', 'linh@zakutek.com', '$argon2id$v=19$m=65536,t=3,p=2$Coo2RngINTiRzYocpj/fPA$j2iVQMu+Jd/H6uQA/l32YuLuAVT3/LKEFIJCRdJoenw', 'Linh Nguyễn', NULL, 'active', '2026-10-16 10:03:42.476348+07', 0, NULL, NULL, '2026-10-16 10:03:42.476348+07', '2026-10-16 10:03:42.476348+07');
INSERT INTO public.users (id, email, password_hash, full_name, avatar_path, status, email_verified_at, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES ('85248067-b042-46ae-bcf7-55641ce30430', 'tiennv@zakutek.com', '$argon2id$v=19$m=65536,t=3,p=2$Rz0JEv8z+WaDLUCOcDINTA$F4XxhdLWbkTTq0xTXa+gNjZPnVefXCpplXmYlHPNE1s', 'Tiến Nguyễn', NULL, 'active', '2026-10-16 10:03:42.476348+07', 0, NULL, NULL, '2026-10-16 10:03:42.476348+07', '2026-10-16 10:03:42.476348+07');
INSERT INTO public.users (id, email, password_hash, full_name, avatar_path, status, email_verified_at, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES ('f42cb0fb-23e0-49cb-8966-c15f509699fe', 'trungld@zakutek.com', '$argon2id$v=19$m=65536,t=3,p=2$Iw5kdaQnxc1XWVB/+VEBIA$5eVwzsqeUzzoSR8U0/eETWJPNCycwQCvBkQo9gbl8n8', 'Trung Lê', NULL, 'active', '2026-10-16 10:03:42.476348+07', 0, NULL, '2026-10-16 18:47:52.556255+07', '2026-10-16 10:03:42.476348+07', '2026-10-16 18:47:52.55729+07');


ALTER TABLE public.users ENABLE TRIGGER ALL;

--
-- Data for Name: ai_conversations; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations DISABLE TRIGGER ALL;



ALTER TABLE public.ai_conversations ENABLE TRIGGER ALL;

--
-- Data for Name: ai_messages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages DISABLE TRIGGER ALL;



ALTER TABLE public.ai_messages ENABLE TRIGGER ALL;

--
-- Data for Name: ai_usage_daily; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_daily DISABLE TRIGGER ALL;



ALTER TABLE public.ai_usage_daily ENABLE TRIGGER ALL;

--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.auth_sessions DISABLE TRIGGER ALL;



ALTER TABLE public.auth_sessions ENABLE TRIGGER ALL;

--
-- Data for Name: cms_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_categories DISABLE TRIGGER ALL;



ALTER TABLE public.cms_categories ENABLE TRIGGER ALL;

--
-- Data for Name: cms_articles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_articles DISABLE TRIGGER ALL;



ALTER TABLE public.cms_articles ENABLE TRIGGER ALL;

--
-- Data for Name: cms_tags; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_tags DISABLE TRIGGER ALL;



ALTER TABLE public.cms_tags ENABLE TRIGGER ALL;

--
-- Data for Name: cms_article_tags; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_article_tags DISABLE TRIGGER ALL;



ALTER TABLE public.cms_article_tags ENABLE TRIGGER ALL;

--
-- Data for Name: cms_comments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_comments DISABLE TRIGGER ALL;



ALTER TABLE public.cms_comments ENABLE TRIGGER ALL;

--
-- Data for Name: cms_landing_pages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_landing_pages DISABLE TRIGGER ALL;

INSERT INTO public.cms_landing_pages (id, key, name, status, og_path, seo_title, seo_description, seo_keywords, canonical_url, seo_noindex, seo_nofollow, og_title, og_description, published_snapshot, created_at, updated_at) VALUES ('7e586b2f-3d33-4478-82bd-c16613d5275a', 'trang-chu', 'Trang chủ', 'published', NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, '{"key": "trang-chu", "seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "name": "Trang chủ", "og_path": null, "sections": [{"id": "4c1dd11a-dd98-411a-a4ff-db711648a8c9", "type": "hero", "config": {"eyebrow": "HỆ SINH THÁI SẢN PHẨM ZUKATEK", "heading": "Sản phẩm số\ncho công việc của bạn.", "subheading": "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."}, "sort_order": 0}, {"id": "d87c6149-d803-4589-a738-31f22c7a5e46", "type": "audience_picker", "config": {"items": [{"key": "individual", "body": "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.", "label": "Cá nhân", "cta_href": "/#contact", "headline": "Dành cho cá nhân", "cta_label": "Tư vấn cho cá nhân "}, {"key": "group", "body": "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.", "label": "Nhóm", "cta_href": "/#contact", "headline": "Dành cho nhóm", "cta_label": "Tư vấn cho nhóm "}, {"key": "business", "body": "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.", "label": "Doanh nghiệp", "cta_href": "/#contact", "headline": "Dành cho doanh nghiệp", "cta_label": "Tư vấn cho doanh nghiệp "}], "title": "Sản phẩm phù hợp với nhu cầu của bạn", "subtitle": "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."}, "sort_order": 1}, {"id": "eff1940f-2e77-45d2-9588-61c890ef01ee", "type": "product_grid", "config": {"limit": 6, "title": "Sản phẩm của ZUKATEK", "category": "", "subtitle": "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.", "show_all_href": "/products", "show_all_label": "Xem tất cả sản phẩm "}, "sort_order": 2}, {"id": "ee788422-eca8-441e-86be-201dbd07397b", "type": "team", "config": {"limit": 0, "title": "Đội ngũ phát triển", "subtitle": "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek."}, "sort_order": 3}, {"id": "b208a676-2c13-4d07-bedb-b3d6a1803911", "type": "buying_steps", "config": {"steps": [{"body": "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.", "title": "Chọn sản phẩm"}, {"body": "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.", "title": "Trải nghiệm bản demo"}, {"body": "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.", "title": "Liên hệ mua sản phẩm"}], "title": "Chọn mua sản phẩm ZUKATEK", "subtitle": "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}, "sort_order": 4}, {"id": "6fd9afba-1161-4626-b3ed-bba424027a53", "type": "featured_articles", "config": {"limit": 3, "filters": {}}, "sort_order": 5}, {"id": "77f50406-e967-4c5c-a466-83923c0f249a", "type": "faq", "config": {"items": [{"question": "Sản phẩm của ZUKATEK dành cho ai?", "answer_html": "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."}, {"question": "Tôi có thể trải nghiệm trước khi mua không?", "answer_html": "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."}, {"question": "Làm thế nào để tìm hiểu kỹ năng của team?", "answer_html": "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ &amp; kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."}, {"question": "Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?", "answer_html": "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."}], "title": "Câu hỏi thường gặp", "eyebrow": "TÌM HIỂU THÊM", "subtitle": "Những thông tin cần biết trước khi chọn mua sản phẩm."}, "sort_order": 6}, {"id": "9aca499b-d1f8-474e-8b99-58f42ab35364", "type": "contact_form", "config": {"note": "", "zalo": "", "email": "", "title": "Cần tư vấn sản phẩm?\nLiên hệ ZUKATEK.", "subtitle": "Nhận tư vấn về tính năng, giá và cách triển khai\ntừ người giới thiệu hoặc đội ngũ ZUKATEK."}, "sort_order": 7}]}', '2026-10-16 10:03:42.485262+07', '2026-10-16 10:03:42.485262+07');


ALTER TABLE public.cms_landing_pages ENABLE TRIGGER ALL;

--
-- Data for Name: cms_landing_sections; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_landing_sections DISABLE TRIGGER ALL;

INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('4c1dd11a-dd98-411a-a4ff-db711648a8c9', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'hero', 0, true, '{"eyebrow": "HỆ SINH THÁI SẢN PHẨM ZUKATEK", "heading": "Sản phẩm số\ncho công việc của bạn.", "subheading": "ZUKATEK phát triển và cung cấp sản phẩm số cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp. Xem tính năng, trải nghiệm sản phẩm và nhận tư vấn để chọn giải pháp phù hợp."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('d87c6149-d803-4589-a738-31f22c7a5e46', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'audience_picker', 1, true, '{"items": [{"key": "individual", "body": "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.", "label": "Cá nhân", "cta_href": "/#contact", "headline": "Dành cho cá nhân", "cta_label": "Tư vấn cho cá nhân "}, {"key": "group", "body": "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.", "label": "Nhóm", "cta_href": "/#contact", "headline": "Dành cho nhóm", "cta_label": "Tư vấn cho nhóm "}, {"key": "business", "body": "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.", "label": "Doanh nghiệp", "cta_href": "/#contact", "headline": "Dành cho doanh nghiệp", "cta_label": "Tư vấn cho doanh nghiệp "}], "title": "Sản phẩm phù hợp với nhu cầu của bạn", "subtitle": "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('eff1940f-2e77-45d2-9588-61c890ef01ee', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'product_grid', 2, true, '{"limit": 6, "title": "Sản phẩm của ZUKATEK", "category": "", "subtitle": "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.", "show_all_href": "/products", "show_all_label": "Xem tất cả sản phẩm "}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('ee788422-eca8-441e-86be-201dbd07397b', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'team', 3, true, '{"limit": 0, "title": "Đội ngũ phát triển", "subtitle": "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('b208a676-2c13-4d07-bedb-b3d6a1803911', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'buying_steps', 4, true, '{"steps": [{"body": "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.", "title": "Chọn sản phẩm"}, {"body": "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.", "title": "Trải nghiệm bản demo"}, {"body": "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.", "title": "Liên hệ mua sản phẩm"}], "title": "Chọn mua sản phẩm ZUKATEK", "subtitle": "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('6fd9afba-1161-4626-b3ed-bba424027a53', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'featured_articles', 5, true, '{"limit": 3, "filters": {}}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('77f50406-e967-4c5c-a466-83923c0f249a', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'faq', 6, true, '{"items": [{"question": "Sản phẩm của ZUKATEK dành cho ai?", "answer_html": "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Mỗi sản phẩm có đối tượng sử dụng, tính năng và phạm vi riêng để bạn lựa chọn."}, {"question": "Tôi có thể trải nghiệm trước khi mua không?", "answer_html": "Sản phẩm có bản demo sẽ có nút “Trải nghiệm” mở trang riêng. Hướng dẫn dùng thử được ghi trong trang chi tiết. Hiện danh mục dùng dữ liệu mẫu và link tạm để xem bố cục."}, {"question": "Làm thế nào để tìm hiểu kỹ năng của team?", "answer_html": "Mỗi thành viên có một hồ sơ riêng trong mục “Đội ngũ &amp; kỹ năng”. Thông tin về vai trò, kỹ năng và sản phẩm đã tham gia sẽ được bổ sung tại đó."}, {"question": "Tôi liên hệ ai để hỏi giá hoặc mua sản phẩm?", "answer_html": "Bạn có thể liên hệ người đã gửi hồ sơ ZUKATEK cho bạn hoặc kênh chung của ZUKATEK. Hãy cho biết sản phẩm quan tâm, số người sử dụng và nhu cầu triển khai để được tư vấn."}], "title": "Câu hỏi thường gặp", "eyebrow": "TÌM HIỂU THÊM", "subtitle": "Những thông tin cần biết trước khi chọn mua sản phẩm."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');
INSERT INTO public.cms_landing_sections (id, landing_page_id, type, sort_order, is_visible, config, created_at, updated_at) VALUES ('9aca499b-d1f8-474e-8b99-58f42ab35364', '7e586b2f-3d33-4478-82bd-c16613d5275a', 'contact_form', 7, true, '{"note": "", "zalo": "", "email": "", "title": "Cần tư vấn sản phẩm?\nLiên hệ ZUKATEK.", "subtitle": "Nhận tư vấn về tính năng, giá và cách triển khai\ntừ người giới thiệu hoặc đội ngũ ZUKATEK."}', '2026-10-16 10:03:42.488886+07', '2026-10-16 10:03:42.488886+07');


ALTER TABLE public.cms_landing_sections ENABLE TRIGGER ALL;

--
-- Data for Name: cms_menus; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_menus DISABLE TRIGGER ALL;

INSERT INTO public.cms_menus (id, name, location, created_at, updated_at) VALUES ('015d00b2-c6b2-4dac-8627-860e4045038d', 'Footer', 'footer', '2026-10-16 10:03:42.500633+07', '2026-10-16 10:03:42.500633+07');
INSERT INTO public.cms_menus (id, name, location, created_at, updated_at) VALUES ('b1116a4e-5b94-4481-8b1e-02984c7752e0', 'Header', 'header', '2026-10-16 10:03:42.502227+07', '2026-10-16 10:03:42.502227+07');


ALTER TABLE public.cms_menus ENABLE TRIGGER ALL;

--
-- Data for Name: cms_menu_items; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_menu_items DISABLE TRIGGER ALL;

INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('569513ef-f1fe-462c-92eb-69099edb0fec', '015d00b2-c6b2-4dac-8627-860e4045038d', NULL, 'Khám phá ZUKATEK', 'internal', NULL, '/', false, 0, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('515d8f42-b654-4d8f-a69a-80fd0a51808c', '015d00b2-c6b2-4dac-8627-860e4045038d', NULL, 'Mua & sử dụng sản phẩm', 'internal', NULL, '/', false, 1, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('6ceed0ac-e5e5-4319-902a-44c8c6bbf100', '015d00b2-c6b2-4dac-8627-860e4045038d', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'Cách mua sản phẩm', 'internal', NULL, '/#collaboration', false, 0, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('25f8e38c-293a-4fe9-914b-bda04de40262', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Về ZUKATEK', 'internal', NULL, '/#about', false, 0, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('82fb6df5-e4b0-4c28-8cd8-ee60c610d7ee', '015d00b2-c6b2-4dac-8627-860e4045038d', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'Liên hệ', 'internal', NULL, '/#contact', false, 1, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('40dbc66b-7dd3-4b21-b3e0-ef672d0c6c62', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Sản phẩm', 'internal', NULL, '/#products', false, 1, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('bfb9d4a8-ffed-445f-95ea-7891c3c8a096', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Đội ngũ & kỹ năng', 'internal', NULL, '/#team', false, 2, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('42f51025-8af8-469a-ab48-fbae0e80acaa', '015d00b2-c6b2-4dac-8627-860e4045038d', '569513ef-f1fe-462c-92eb-69099edb0fec', 'Blog', 'internal', NULL, '/blog', false, 3, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('a6b5d2e5-f91c-428a-af0b-f4b1cc1c4fc3', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Trang chủ', 'internal', NULL, '/', false, 0, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('82397908-b350-4346-9461-5756e4f8b52c', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Sản phẩm', 'internal', NULL, '/products', false, 1, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('2284f3a6-cdd0-44ba-8b44-415af19e81ec', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Blog', 'internal', NULL, '/blog', false, 2, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('fd5f0c60-4976-4938-a24a-87e7115090df', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Giới thiệu', 'internal', NULL, '/#about', false, 3, NULL);
INSERT INTO public.cms_menu_items (id, menu_id, parent_id, label, link_type, target_id, url, open_new_tab, sort_order, description) VALUES ('5573c2ad-2307-4c70-b42a-96ce3155d220', 'b1116a4e-5b94-4481-8b1e-02984c7752e0', NULL, 'Liên hệ', 'internal', NULL, '/#contact', false, 4, NULL);


ALTER TABLE public.cms_menu_items ENABLE TRIGGER ALL;

--
-- Data for Name: cms_newsletter_subscribers; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_newsletter_subscribers DISABLE TRIGGER ALL;



ALTER TABLE public.cms_newsletter_subscribers ENABLE TRIGGER ALL;

--
-- Data for Name: cms_pages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_pages DISABLE TRIGGER ALL;

INSERT INTO public.cms_pages (id, title, slug, body_html, body_json, parent_id, sort_order, template, status, og_path, seo_title, seo_description, seo_keywords, canonical_url, seo_noindex, seo_nofollow, og_title, og_description, published_at, published_snapshot, created_at, updated_at, landing_id) VALUES ('6f6ac11c-85b9-4443-82c5-9e9f84eaf398', 'Trang chủ', 'trang-chu', NULL, NULL, NULL, 0, NULL, 'published', NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, '2026-10-16 10:03:42.491201+07', '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}', '2026-10-16 10:03:42.491201+07', '2026-10-16 10:03:42.491201+07', '7e586b2f-3d33-4478-82bd-c16613d5275a');


ALTER TABLE public.cms_pages ENABLE TRIGGER ALL;

--
-- Data for Name: cms_region_blocks; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_region_blocks DISABLE TRIGGER ALL;



ALTER TABLE public.cms_region_blocks ENABLE TRIGGER ALL;

--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.files DISABLE TRIGGER ALL;

INSERT INTO public.files (id, slug, storage_key, mime, size_bytes, sha256, width, height, owner_kind, owner_id, created_at) VALUES ('0fa943ab-94b9-4e9c-864a-cf621daac632', 'avatar-c425e2e7', 'members/066db29a-ec57-4ae0-9eec-940e1aa9578a/avatar-0b7b6a45-869b-46f7-b35a-17c2132bffb6.png', 'image/png', 836884, '0d4cd08f412134c746b0f514f86e4405c527f0a0393e5bd5fcd26834e2f824cc', 941, 941, 'member', '066db29a-ec57-4ae0-9eec-940e1aa9578a', '2026-10-16 10:18:49.271152+07');


ALTER TABLE public.files ENABLE TRIGGER ALL;

--
-- Data for Name: goose_db_version; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.goose_db_version DISABLE TRIGGER ALL;

INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (1, 0, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (2, 1, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (3, 2, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (4, 3, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (5, 4, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (6, 5, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (7, 6, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (8, 7, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (9, 24, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (10, 25, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (11, 26, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (12, 27, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (13, 28, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (14, 29, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (15, 30, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (16, 31, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (17, 32, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (18, 33, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (19, 34, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (20, 35, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (21, 36, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (22, 37, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (23, 38, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (24, 39, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (25, 40, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (26, 41, true, '2026-10-16 10:03:42.458659');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (27, 42, true, '2026-10-16 10:04:20.514833');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (28, 43, true, '2026-10-16 10:04:20.522014');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (29, 44, true, '2026-10-16 10:04:20.535824');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (30, 45, true, '2026-10-16 10:04:20.540358');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (31, 46, true, '2026-10-16 10:04:20.551192');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (32, 47, true, '2026-10-16 10:04:20.554766');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (33, 48, true, '2026-10-16 10:55:16.856919');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (34, 49, true, '2026-10-16 13:57:58.45339');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (35, 50, true, '2026-10-16 16:59:08.53237');
INSERT INTO public.goose_db_version (id, version_id, is_applied, tstamp) VALUES (36, 51, true, '2026-10-16 17:11:12.820499');


ALTER TABLE public.goose_db_version ENABLE TRIGGER ALL;

--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.leads DISABLE TRIGGER ALL;



ALTER TABLE public.leads ENABLE TRIGGER ALL;

--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.products DISABLE TRIGGER ALL;



ALTER TABLE public.products ENABLE TRIGGER ALL;

--
-- Data for Name: lead_products; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.lead_products DISABLE TRIGGER ALL;



ALTER TABLE public.lead_products ENABLE TRIGGER ALL;

--
-- Data for Name: mcp_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.mcp_tokens DISABLE TRIGGER ALL;



ALTER TABLE public.mcp_tokens ENABLE TRIGGER ALL;

--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_tokens DISABLE TRIGGER ALL;



ALTER TABLE public.password_reset_tokens ENABLE TRIGGER ALL;

--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.permissions DISABLE TRIGGER ALL;

INSERT INTO public.permissions (id, code, description, created_at) VALUES ('5bcf56d7-001f-4c94-95e6-d59eb020313b', '*', 'Wildcard — all permissions', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('97b0cdb9-be35-4c50-a2e0-280af3289b4e', 'users.read', 'View users', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('7b862e6a-0252-46bb-bee2-9ed175d0c69a', 'users.create', 'Create users', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('2b155955-6002-44f8-b565-71ad2ed7441a', 'users.update', 'Update users', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('f9d1c109-c296-4b01-94f4-39316fa3d383', 'users.delete', 'Delete/disable users', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('92b1fecd-4633-413b-a067-224497dac5e4', 'users.assign_role', 'Assign/remove roles', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('ee9ed43d-d7fa-4092-b484-76c1a4bc5053', 'roles.read', 'View roles and their permissions', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('55a99309-1abd-4dd3-959a-f86446cfecfe', 'roles.manage', 'Create/update/delete roles, assign permissions', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('51b5dded-bc08-4aff-8a62-9402125a85a4', 'permissions.read', 'View permission catalog', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('0a57cd83-9cad-43ef-99d4-fd121a910268', 'sessions.read', 'View other users'' sessions', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('97f19070-e893-4315-a8c5-be5889b931ae', 'sessions.revoke', 'Revoke other users'' sessions', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('29121c60-a322-4c99-b419-1b88c74bbcd0', 'settings.read', 'Read system settings', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('727d20bd-4dd6-460d-ba9b-189e58514b91', 'settings.manage', 'Update system settings', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('6f021fb0-c042-4504-b7d8-eaaec8fce987', 'impersonation.start', 'Impersonate another user', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('a326b5d1-c570-4da1-8ded-8173e01ebcdc', 'cms.article.view', 'View articles (editor: own only)', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('10780841-b62d-4f0c-97c5-2fcd673b2c0a', 'cms.article.create', 'Create articles', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('6ecbcca9-2a3a-4900-8a81-9ca9589ef081', 'cms.article.edit', 'Edit articles', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('7484ae94-a81f-45ec-a42a-cb867fc30c01', 'cms.article.delete', 'Delete articles', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('63f301bd-3d99-47bc-bfc9-cacc878f56b1', 'cms.article.submit', 'Submit articles for review', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('17326241-70e1-4863-93b5-3f4ee29ef0a3', 'cms.article.review', 'Approve/reject articles pending review', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('7c12b53b-6c0e-4c65-a7d1-3e83c9ce92d6', 'cms.article.publish', 'Publish / schedule / unpublish / re-publish articles', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('1143858a-4f7a-4aeb-afde-08981f4e4b46', 'cms.page.view', 'View static pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('9ad8a4ac-fe71-4f83-a527-de031be730f0', 'cms.page.create', 'Create static pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('9b697e28-7cb0-4713-a453-37bb8138a9ec', 'cms.page.edit', 'Edit static pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('50bf40b4-e641-49be-81fc-21287e80360a', 'cms.page.delete', 'Delete static pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('e28b233d-cccc-4f88-b8a1-f105d0f001e2', 'cms.page.publish', 'Publish/unpublish static pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('b4d08f37-eeeb-4834-9cd3-8c4c1c493197', 'cms.taxonomy.manage', 'Create/update/delete categories and tags', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('340d0a72-c41a-4966-845c-6cb19a83a08e', 'cms.menu.manage', 'Manage navigation menus', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('75f4407e-953b-4a08-81b0-4c8890e43175', 'cms.comment.moderate', 'Moderate comments', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('48338bb9-4216-4534-a8f1-2a7e3b8ba408', 'cms.landing.manage', 'Manage landing pages', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('59d7d58c-b96b-45ff-8d0c-c576ebe550ba', 'cms.settings.read', 'Read CMS feature flags', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('d128ec91-4126-471a-839f-0577af60f8d1', 'cms.settings.manage', 'Update CMS feature flags', '2026-10-13 15:59:56.457109+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('7766ccff-ff6e-475a-a475-1718fd9e31d3', 'cms.newsletter.manage', 'Manage newsletter subscribers', '2026-10-13 15:59:56.615081+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('31616395-1701-41be-960b-269d32eb9ad3', 'members.view', 'View team member profiles', '2026-10-13 15:59:56.618432+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('ebcd91b4-a908-436f-9a7e-4fda12dbc71f', 'members.manage', 'Create/update/delete team member profiles', '2026-10-13 15:59:56.618432+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('9854973a-1185-4d7f-80fd-a89401592715', 'products.view', 'View products and product categories', '2026-10-13 15:59:56.630187+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('01bffe73-6026-4b60-9bb6-7c182e4ddb69', 'products.category.manage', 'Create/update/delete product categories', '2026-10-13 15:59:56.630187+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('e3ba7647-7fe9-4f0b-818b-7dd9f599228b', 'products.create', 'Create products', '2026-10-13 15:59:56.64574+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('e219fd2c-b6e2-41a7-8769-39a2cb14c0a2', 'products.edit', 'Edit products', '2026-10-13 15:59:56.64574+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('ac401418-23f2-4067-bbff-2b3d131082d7', 'products.delete', 'Delete products', '2026-10-13 15:59:56.64574+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('65eef7f4-43bd-4828-9933-b614e2b9a36f', 'products.publish', 'Publish / unpublish / archive products', '2026-10-13 15:59:56.64574+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('c8833b7c-a983-4820-bc70-a987c31f8993', 'crm.leads.view', 'View leads assigned to you and the shared queue', '2026-10-13 15:59:56.692191+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('bd73a29f-ef5d-4bd9-b6a0-c566b2138f4d', 'crm.leads.view_all', 'View every lead, including other people''s', '2026-10-13 15:59:56.692191+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('855e8c13-7a1e-4138-a2c8-2d46f4bcd35a', 'crm.leads.manage', 'Create, edit, assign and move leads', '2026-10-13 15:59:56.692191+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('f71d5cf1-26ec-4e50-a236-df26495c4612', 'ai.chat.handle', 'Read the assistant inbox and take over conversations', '2026-10-13 15:59:56.713479+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('c7ceeb02-96db-4ea3-a03f-11e82c9f052f', 'ai.mcp.use', 'Issue and use MCP tokens for agent access', '2026-10-13 15:59:56.74717+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('72933350-2e5b-4a1c-875d-c037ec8e1ee0', 'activity.read', 'Read the activity log', '2026-10-13 15:59:56.894851+07');
INSERT INTO public.permissions (id, code, description, created_at) VALUES ('31c3a3c2-b4dd-47ec-9722-97c190277db5', 'activity.purge', 'Permanently delete activity log entries older than a chosen date', '2026-10-16 10:04:20.551192+07');


ALTER TABLE public.permissions ENABLE TRIGGER ALL;

--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_categories DISABLE TRIGGER ALL;



ALTER TABLE public.product_categories ENABLE TRIGGER ALL;

--
-- Data for Name: product_category_links; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_category_links DISABLE TRIGGER ALL;



ALTER TABLE public.product_category_links ENABLE TRIGGER ALL;

--
-- Data for Name: product_media; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_media DISABLE TRIGGER ALL;



ALTER TABLE public.product_media ENABLE TRIGGER ALL;

--
-- Data for Name: product_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_members DISABLE TRIGGER ALL;



ALTER TABLE public.product_members ENABLE TRIGGER ALL;

--
-- Data for Name: published_docs; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.published_docs DISABLE TRIGGER ALL;

INSERT INTO public.published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at, written_at) VALUES ('page', 'en', 'trang-chu', '6f6ac11c-85b9-4443-82c5-9e9f84eaf398', true, 'Trang chủ', '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}', '2026-10-16 10:03:42.495504+07', '2026-10-16 10:03:42.495504+07');
INSERT INTO public.published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at, written_at) VALUES ('page', 'vi', 'trang-chu', '6f6ac11c-85b9-4443-82c5-9e9f84eaf398', true, 'Trang chủ', '{"seo": {"title": null, "noindex": false, "keywords": null, "nofollow": false, "og_title": null, "description": null, "canonical_url": null, "og_description": null}, "slug": "trang-chu", "title": "Trang chủ", "og_path": null, "template": null, "body_html": null, "landing_id": "7e586b2f-3d33-4478-82bd-c16613d5275a", "inline_widgets": null}', '2026-10-16 10:03:42.49999+07', '2026-10-16 10:03:42.49999+07');


ALTER TABLE public.published_docs ENABLE TRIGGER ALL;

--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.roles DISABLE TRIGGER ALL;

INSERT INTO public.roles (id, code, name, description, is_system, created_at, updated_at) VALUES ('ed5d8701-4bc1-47f5-a51d-26a3b5c3f6cf', 'super_admin', 'Super Admin', 'Full access (wildcard)', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.roles (id, code, name, description, is_system, created_at, updated_at) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'admin', 'Admin', 'Platform administration', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07');
INSERT INTO public.roles (id, code, name, description, is_system, created_at, updated_at) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'editor', 'Editor', 'Self-service baseline', true, '2026-10-13 15:59:56.123828+07', '2026-10-13 15:59:56.123828+07');


ALTER TABLE public.roles ENABLE TRIGGER ALL;

--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions DISABLE TRIGGER ALL;

INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('ed5d8701-4bc1-47f5-a51d-26a3b5c3f6cf', '5bcf56d7-001f-4c94-95e6-d59eb020313b');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '97b0cdb9-be35-4c50-a2e0-280af3289b4e');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7b862e6a-0252-46bb-bee2-9ed175d0c69a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '2b155955-6002-44f8-b565-71ad2ed7441a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'f9d1c109-c296-4b01-94f4-39316fa3d383');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '92b1fecd-4633-413b-a067-224497dac5e4');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ee9ed43d-d7fa-4092-b484-76c1a4bc5053');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '55a99309-1abd-4dd3-959a-f86446cfecfe');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '51b5dded-bc08-4aff-8a62-9402125a85a4');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '0a57cd83-9cad-43ef-99d4-fd121a910268');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '97f19070-e893-4315-a8c5-be5889b931ae');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'a326b5d1-c570-4da1-8ded-8173e01ebcdc');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '10780841-b62d-4f0c-97c5-2fcd673b2c0a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '6ecbcca9-2a3a-4900-8a81-9ca9589ef081');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7484ae94-a81f-45ec-a42a-cb867fc30c01');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '63f301bd-3d99-47bc-bfc9-cacc878f56b1');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '17326241-70e1-4863-93b5-3f4ee29ef0a3');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7c12b53b-6c0e-4c65-a7d1-3e83c9ce92d6');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '1143858a-4f7a-4aeb-afde-08981f4e4b46');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9ad8a4ac-fe71-4f83-a527-de031be730f0');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9b697e28-7cb0-4713-a453-37bb8138a9ec');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '50bf40b4-e641-49be-81fc-21287e80360a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e28b233d-cccc-4f88-b8a1-f105d0f001e2');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'b4d08f37-eeeb-4834-9cd3-8c4c1c493197');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '340d0a72-c41a-4966-845c-6cb19a83a08e');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '75f4407e-953b-4a08-81b0-4c8890e43175');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '48338bb9-4216-4534-a8f1-2a7e3b8ba408');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '59d7d58c-b96b-45ff-8d0c-c576ebe550ba');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'd128ec91-4126-471a-839f-0577af60f8d1');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'a326b5d1-c570-4da1-8ded-8173e01ebcdc');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '10780841-b62d-4f0c-97c5-2fcd673b2c0a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '6ecbcca9-2a3a-4900-8a81-9ca9589ef081');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '7484ae94-a81f-45ec-a42a-cb867fc30c01');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '63f301bd-3d99-47bc-bfc9-cacc878f56b1');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '75f4407e-953b-4a08-81b0-4c8890e43175');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '59d7d58c-b96b-45ff-8d0c-c576ebe550ba');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '7766ccff-ff6e-475a-a475-1718fd9e31d3');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '31616395-1701-41be-960b-269d32eb9ad3');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ebcd91b4-a908-436f-9a7e-4fda12dbc71f');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '31616395-1701-41be-960b-269d32eb9ad3');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '9854973a-1185-4d7f-80fd-a89401592715');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '01bffe73-6026-4b60-9bb6-7c182e4ddb69');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '9854973a-1185-4d7f-80fd-a89401592715');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e3ba7647-7fe9-4f0b-818b-7dd9f599228b');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'e219fd2c-b6e2-41a7-8769-39a2cb14c0a2');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'ac401418-23f2-4067-bbff-2b3d131082d7');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '65eef7f4-43bd-4828-9933-b614e2b9a36f');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'e3ba7647-7fe9-4f0b-818b-7dd9f599228b');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'e219fd2c-b6e2-41a7-8769-39a2cb14c0a2');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'c8833b7c-a983-4820-bc70-a987c31f8993');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'bd73a29f-ef5d-4bd9-b6a0-c566b2138f4d');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '855e8c13-7a1e-4138-a2c8-2d46f4bcd35a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'c8833b7c-a983-4820-bc70-a987c31f8993');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '855e8c13-7a1e-4138-a2c8-2d46f4bcd35a');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'f71d5cf1-26ec-4e50-a236-df26495c4612');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('05173f7e-e061-48f2-9fa5-b7ef4f92ea80', 'f71d5cf1-26ec-4e50-a236-df26495c4612');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', 'c7ceeb02-96db-4ea3-a03f-11e82c9f052f');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '72933350-2e5b-4a1c-875d-c037ec8e1ee0');
INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('7c5d683b-eb16-4d19-9243-5dc58ba56926', '31c3a3c2-b4dd-47ec-9722-97c190277db5');


ALTER TABLE public.role_permissions ENABLE TRIGGER ALL;

--
-- Data for Name: staff_push_subs; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.staff_push_subs DISABLE TRIGGER ALL;



ALTER TABLE public.staff_push_subs ENABLE TRIGGER ALL;

--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.system_settings DISABLE TRIGGER ALL;

INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('cms.home_page_slug', '"trang-chu"', NULL, '2026-10-16 10:03:42.494129+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('site.brand_tagline', '"Đội ngũ phát triển sản phẩm số\ncho cá nhân, nhóm và doanh nghiệp."', NULL, '2026-10-16 10:03:42.514663+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('translation.enabled', 'true', NULL, '2026-10-16 10:03:42.517682+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('translation.locales', '"en"', NULL, '2026-10-16 10:03:42.517682+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('site.footer_copyright', '"© {year} ZUKATEK"', NULL, '2026-10-16 10:03:42.514663+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('ai.enabled', 'true', NULL, '2026-10-16 13:17:14.937939+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('security.recaptcha_enabled', 'true', NULL, '2026-10-16 19:31:29.196691+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('security.recaptcha_site_key', '"6LeMMfItAAAAAGMqBQJvF_d-M2iMCQNjavGz4IKd"', NULL, '2026-10-16 19:44:05.928819+07', NULL);
INSERT INTO public.system_settings (key, value, value_encrypted, updated_at, updated_by) VALUES ('security.recaptcha_secret', NULL, NULL, '2026-10-16 19:44:05.928819+07', NULL);


ALTER TABLE public.system_settings ENABLE TRIGGER ALL;

--
-- Data for Name: translations; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.translations DISABLE TRIGGER ALL;

INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '40dbc66b-7dd3-4b21-b3e0-ef672d0c6c62', 'en', '{"label": "Products", "description": "The catalogue, the features and the demos"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', 'bfb9d4a8-ffed-445f-95ea-7891c3c8a096', 'en', '{"label": "Team & skills", "description": "The people behind ZUKATEK"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '42f51025-8af8-469a-ab48-fbae0e80acaa', 'en', '{"label": "Blog"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '6ceed0ac-e5e5-4319-902a-44c8c6bbf100', 'en', '{"label": "How to buy"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '569513ef-f1fe-462c-92eb-69099edb0fec', 'en', '{"label": "Explore ZUKATEK"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '25f8e38c-293a-4fe9-914b-bda04de40262', 'en', '{"label": "About ZUKATEK"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '515d8f42-b654-4d8f-a69a-80fd0a51808c', 'en', '{"label": "Buying & using products"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '82fb6df5-e4b0-4c28-8cd8-ee60c610d7ee', 'en', '{"label": "Contact"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', '4c1dd11a-dd98-411a-a4ff-db711648a8c9', 'en', '{"config": {"eyebrow": "THE ZUKATEK PRODUCT ECOSYSTEM", "heading": "Digital products\nfor the work you do.", "subheading": "ZUKATEK builds and delivers digital products for individuals, teams, small businesses and companies. Explore the features, try a product and get advice on the right fit."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', 'd87c6149-d803-4589-a738-31f22c7a5e46', 'en', '{"config": {"items": [{"body": "Tools for everyday work: taking notes, keeping information in order and staying on top of your own tasks.", "label": "Individuals", "headline": "For individuals", "cta_label": "Advice for individuals "}, {"body": "Products that help a team organise its work, share documents and follow progress in one place.", "label": "Teams", "headline": "For teams", "cta_label": "Advice for teams "}, {"body": "Products for managing and running a business. Check the features, the scope and the cost before you buy.", "label": "Companies", "headline": "For companies", "cta_label": "Advice for companies "}], "title": "Products that match the way you work", "subtitle": "Digital products for personal work, for working together in a team, and for running a company."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', 'eff1940f-2e77-45d2-9588-61c890ef01ee', 'en', '{"config": {"title": "ZUKATEK products", "subtitle": "Explore the features, open a demo and ask for advice about the product you have in mind.", "show_all_label": "See every product "}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', 'ee788422-eca8-441e-86be-201dbd07397b', 'en', '{"config": {"title": "The team behind them", "subtitle": "The people who build and develop Zukatek''s products."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', 'b208a676-2c13-4d07-bedb-b3d6a1803911', 'en', '{"config": {"steps": [{"body": "Browse the catalogue, the features and who each product is for, and find the right one.", "title": "Choose a product"}, {"body": "Open the product''s own trial and check the features you actually need.", "title": "Try the demo"}, {"body": "Ask about pricing, scope and rollout — from the person who referred you or from ZUKATEK.", "title": "Get in touch to buy"}], "title": "Buying a ZUKATEK product", "subtitle": "Three steps to the product that fits what you need."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', '77f50406-e967-4c5c-a466-83923c0f249a', 'en', '{"config": {"items": [{"question": "Who are ZUKATEK''s products for?", "answer_html": "ZUKATEK builds digital products for individuals, teams and companies. Each product has its own audience, features and scope, so you can pick the one that fits."}, {"question": "Can I try a product before buying it?", "answer_html": "Products with a demo show a “Try it” button that opens their own trial, and the detail page explains how to use it. The catalogue currently uses sample data and placeholder links to show the layout."}, {"question": "How can I learn what the team does?", "answer_html": "Every member has a profile under “The team”. Their role, their skills and the products they work on are listed there."}, {"question": "Who do I contact about pricing or buying?", "answer_html": "Contact whoever sent you this ZUKATEK profile, or ZUKATEK directly. Tell us which product interests you, how many people will use it and how you plan to roll it out."}], "title": "Frequently asked questions", "eyebrow": "GOOD TO KNOW", "subtitle": "What to know before choosing a product."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('landing_section', '9aca499b-d1f8-474e-8b99-58f42ab35364', 'en', '{"config": {"title": "Need advice on a product?\nTalk to ZUKATEK.", "subtitle": "Ask about features, pricing and rollout\nfrom your referrer or from the ZUKATEK team."}}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', 'a6b5d2e5-f91c-428a-af0b-f4b1cc1c4fc3', 'en', '{"label": "Home"}', '2026-10-16 10:21:22.738419+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '82397908-b350-4346-9461-5756e4f8b52c', 'en', '{"label": "Products"}', '2026-10-16 10:21:22.738419+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '2284f3a6-cdd0-44ba-8b44-415af19e81ec', 'en', '{"label": "Blog"}', '2026-10-16 10:21:22.738419+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', 'fd5f0c60-4976-4938-a24a-87e7115090df', 'en', '{"label": "About"}', '2026-10-16 10:21:22.738419+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('menu_item', '5573c2ad-2307-4c70-b42a-96ce3155d220', 'en', '{"label": "Contact"}', '2026-10-16 10:21:22.738419+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('site_chrome', '00000000-0000-0000-0000-00005174e000', 'en', '{"brand_tagline": "A team building digital products\nfor individuals, teams and companies.", "footer_copyright": "© {year} ZUKATEK"}', '2026-10-16 10:03:42.515431+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('member', '066db29a-ec57-4ae0-9eec-940e1aa9578a', 'en', '{"bio": "Leads AI and automation at Zukatek, around one standing question: what should a machine do, and what must stay with a person. Tru puts AI where the work repeats — answering customers after hours, moving content between languages, drafting for a writer — and stops before convenience turns into a wrong answer sent to your customers. The part that gets the most attention is not what the machine can do but what it costs: an assistant on duty around the clock is only worth having if it is cheaper than what it replaces.", "role": "AI Engineer"}', '2026-10-16 18:38:12.582096+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('member', '646036e7-1950-4738-8c64-ceb1e59bc6bd', 'en', '{"bio": "Owns the first thing your customers meet: the website. A beautiful page that loads slowly on a weak connection is a page most people never see as beautiful — so Lynn works on speed, on how the site behaves on a phone, and on whether it turns up at all when someone types a search. Running the site in more than one language sits here too: the same content reaching customers at home and abroad, without writing it twice.", "role": "Web Engineer"}', '2026-10-16 18:38:12.589142+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('member', '8ea3e836-947e-4625-be51-5158816ed953', 'en', '{"bio": "Builds the part you open every morning: the admin area where products, content and customers are managed. Good admin software is not measured in features but in how many clicks a task takes — and in whether a slip can be undone. Ty works on exactly that: shorter paths through a task, error messages you can actually read, and every change tested before it reaches the people using it.", "role": "Software Engineer"}', '2026-10-16 18:38:12.59554+07');
INSERT INTO public.translations (entity, entity_id, locale, "values", updated_at) VALUES ('member', '7085ad1a-28b9-4a30-8c51-c3fadc16cb46', 'en', '{"bio": "Looks after the core of the system — everything your orders, accounts and customer records pass through. It is the part nobody sees, and the part everybody notices the moment it is weak: a page that never loads, numbers that drift after a single action, someone seeing what was never theirs. Nat builds so those things do not happen, including in the awkward cases: several people editing at once, a connection dropping mid-way, old data moving to a new shape while the system stays up.", "role": "Systems Engineer"}', '2026-10-16 18:38:12.573407+07');


ALTER TABLE public.translations ENABLE TRIGGER ALL;

--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.user_roles DISABLE TRIGGER ALL;

INSERT INTO public.user_roles (user_id, role_id, assigned_at, assigned_by) VALUES ('85248067-b042-46ae-bcf7-55641ce30430', '05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '2026-10-16 10:03:42.480042+07', NULL);
INSERT INTO public.user_roles (user_id, role_id, assigned_at, assigned_by) VALUES ('3ccbbabd-23cd-406e-9569-01829d6842a0', '05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '2026-10-16 10:03:42.480042+07', NULL);
INSERT INTO public.user_roles (user_id, role_id, assigned_at, assigned_by) VALUES ('d365846d-f064-405c-b0de-5ad6530fec26', '05173f7e-e061-48f2-9fa5-b7ef4f92ea80', '2026-10-16 10:03:42.480042+07', NULL);
INSERT INTO public.user_roles (user_id, role_id, assigned_at, assigned_by) VALUES ('f42cb0fb-23e0-49cb-8966-c15f509699fe', 'ed5d8701-4bc1-47f5-a51d-26a3b5c3f6cf', '2026-10-16 10:50:04.510278+07', NULL);


ALTER TABLE public.user_roles ENABLE TRIGGER ALL;

--
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activity_log_id_seq', 1, false);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goose_db_version_id_seq', 36, true);


--
-- PostgreSQL database dump complete
--

\unrestrict YlCnRSvTpqXyQbykUME6AChWz4CQzyOF1g3GaGdCTMXI7KpqVaXVLWhkAuQ1W0d

