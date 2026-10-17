--
-- PostgreSQL database dump
--

\restrict 9fF1C37NBblyczMgPeCaYqv0PHwIxQaGhF8nJjfausopx8TtXgk2Sr9ibT802lt

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
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    entity text,
    entity_id uuid,
    entity_label text,
    actor_id uuid,
    actor_label text NOT NULL,
    ip inet,
    correlation_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state text DEFAULT 'bot'::text NOT NULL,
    visitor_key text NOT NULL,
    referrer_member_id uuid,
    lead_id uuid,
    claimed_by_user_id uuid,
    claimed_at timestamp with time zone,
    turn_count integer DEFAULT 0 NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_notified_at timestamp with time zone,
    CONSTRAINT ai_conversations_state_check CHECK ((state = ANY (ARRAY['bot'::text, 'waiting'::text, 'human'::text, 'closed'::text])))
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    author_user_id uuid,
    content text NOT NULL,
    token_in integer DEFAULT 0 NOT NULL,
    token_out integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['visitor'::text, 'assistant'::text, 'staff'::text, 'system'::text])))
);


--
-- Name: ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    base_url text DEFAULT ''::text NOT NULL,
    api_key bytea,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_providers_kind_check CHECK ((kind = ANY (ARRAY['anthropic'::text, 'openai'::text]))),
    CONSTRAINT ai_providers_label_check CHECK ((btrim(label) <> ''::text))
);


--
-- Name: ai_purpose_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_purpose_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purpose text NOT NULL,
    provider_id uuid NOT NULL,
    model text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_purpose_models_model_check CHECK ((btrim(model) <> ''::text)),
    CONSTRAINT ai_purpose_models_purpose_check CHECK ((purpose = ANY (ARRAY['chat'::text, 'content'::text])))
);


--
-- Name: ai_usage_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_daily (
    day date NOT NULL,
    conversations integer DEFAULT 0 NOT NULL,
    tokens_in bigint DEFAULT 0 NOT NULL,
    tokens_out bigint DEFAULT 0 NOT NULL
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    user_agent text,
    ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: cms_article_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_article_tags (
    article_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: cms_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    body_html text,
    body_json jsonb,
    category_id uuid,
    author_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    featured_path text,
    og_path text,
    seo_title text,
    seo_description text,
    seo_keywords text,
    canonical_url text,
    seo_noindex boolean DEFAULT false NOT NULL,
    seo_nofollow boolean DEFAULT false NOT NULL,
    og_title text,
    og_description text,
    published_at timestamp with time zone,
    published_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    author_role text DEFAULT 'editor'::text NOT NULL,
    review_note text,
    CONSTRAINT cms_articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'needs_revision'::text, 'scheduled'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: cms_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    parent_id uuid,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    seo_title text,
    seo_description text,
    seo_keywords text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    CONSTRAINT cms_categories_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: cms_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    parent_id uuid,
    author_user_id uuid,
    author_name text NOT NULL,
    author_email public.citext,
    body text NOT NULL,
    ip_address inet,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cms_comments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'spam'::text, 'rejected'::text])))
);


--
-- Name: cms_landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_landing_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    og_path text,
    seo_title text,
    seo_description text,
    seo_keywords text,
    canonical_url text,
    seo_noindex boolean DEFAULT false NOT NULL,
    seo_nofollow boolean DEFAULT false NOT NULL,
    og_title text,
    og_description text,
    published_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cms_landing_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: cms_landing_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_landing_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    landing_page_id uuid NOT NULL,
    type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cms_landing_sections_type_check CHECK ((type = ANY (ARRAY['hero'::text, 'slider'::text, 'featured_articles'::text, 'categories_showcase'::text, 'rich_text'::text, 'cta_banner'::text, 'testimonials'::text, 'logos'::text, 'stats'::text, 'media_text'::text, 'newsletter'::text, 'faq'::text, 'gallery'::text, 'html_embed'::text, 'audience_picker'::text, 'product_grid'::text, 'team'::text, 'buying_steps'::text, 'contact_form'::text])))
);


--
-- Name: cms_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    parent_id uuid,
    label text NOT NULL,
    link_type text NOT NULL,
    target_id uuid,
    url text,
    open_new_tab boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    description text,
    CONSTRAINT cms_menu_items_link_type_check CHECK ((link_type = ANY (ARRAY['internal'::text, 'external'::text, 'article'::text, 'page'::text, 'category'::text])))
);


--
-- Name: cms_menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cms_newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    source_key text,
    ip_address inet,
    confirmed_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cms_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    body_html text,
    body_json jsonb,
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    template text,
    status text DEFAULT 'draft'::text NOT NULL,
    og_path text,
    seo_title text,
    seo_description text,
    seo_keywords text,
    canonical_url text,
    seo_noindex boolean DEFAULT false NOT NULL,
    seo_nofollow boolean DEFAULT false NOT NULL,
    og_title text,
    og_description text,
    published_at timestamp with time zone,
    published_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    landing_id uuid,
    CONSTRAINT cms_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: cms_region_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_region_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region text NOT NULL,
    kind text NOT NULL,
    widget_type text,
    menu_id uuid,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    page_group text DEFAULT 'common'::text NOT NULL,
    CONSTRAINT cms_region_blocks_kind_check CHECK ((kind = ANY (ARRAY['widget'::text, 'menu'::text]))),
    CONSTRAINT cms_region_blocks_kind_target CHECK ((((kind = 'widget'::text) AND (widget_type IS NOT NULL) AND (menu_id IS NULL)) OR ((kind = 'menu'::text) AND (menu_id IS NOT NULL) AND (widget_type IS NULL))))
);


--
-- Name: cms_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    storage_key text NOT NULL,
    mime text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    width integer,
    height integer,
    owner_kind text NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: goose_db_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goose_db_version (
    id integer NOT NULL,
    version_id bigint NOT NULL,
    is_applied boolean NOT NULL,
    tstamp timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.goose_db_version ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.goose_db_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lead_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_products (
    lead_id uuid NOT NULL,
    product_id uuid NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text,
    phone text,
    zalo text,
    source text DEFAULT 'manual'::text NOT NULL,
    conversation_id uuid,
    assigned_member_id uuid,
    status text DEFAULT 'new'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_reachable CHECK (((COALESCE(email, ''::text) <> ''::text) OR (COALESCE(phone, ''::text) <> ''::text) OR (COALESCE(zalo, ''::text) <> ''::text))),
    CONSTRAINT leads_source_check CHECK ((source = ANY (ARRAY['chat'::text, 'form'::text, 'manual'::text]))),
    CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: mcp_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    token_hint text NOT NULL,
    label text NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    full_name text NOT NULL,
    role text,
    bio text,
    avatar_path text,
    email text,
    zalo text,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    CONSTRAINT members_display_name_check CHECK (((display_name IS NULL) OR (btrim(display_name) <> ''::text)))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    requested_ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seo_title text,
    seo_description text,
    seo_keywords text,
    status text DEFAULT 'published'::text NOT NULL,
    CONSTRAINT product_categories_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: product_category_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_category_links (
    product_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: product_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    kind text NOT NULL,
    path text,
    video_url text,
    caption text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_media_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT product_media_source_xor CHECK ((((kind = 'image'::text) AND (path IS NOT NULL) AND (video_url IS NULL)) OR ((kind = 'video'::text) AND (video_url IS NOT NULL) AND (path IS NULL))))
);


--
-- Name: product_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_members (
    product_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    summary text,
    body_html text,
    body_json jsonb,
    cover_path text,
    status text DEFAULT 'draft'::text NOT NULL,
    lifecycle text DEFAULT 'idea'::text NOT NULL,
    version text,
    released_at date,
    audience jsonb DEFAULT '[]'::jsonb NOT NULL,
    platforms jsonb DEFAULT '[]'::jsonb NOT NULL,
    tech_stack jsonb DEFAULT '[]'::jsonb NOT NULL,
    highlights jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    product_url text,
    demo_url text,
    demo_access text,
    demo_instructions jsonb DEFAULT '[]'::jsonb NOT NULL,
    seo_title text,
    seo_description text,
    seo_keywords text,
    canonical_url text,
    seo_noindex boolean DEFAULT false NOT NULL,
    seo_nofollow boolean DEFAULT false NOT NULL,
    og_title text,
    og_description text,
    og_path text,
    published_at timestamp with time zone,
    published_snapshot jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['idea'::text, 'building'::text, 'launched'::text]))),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: published_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.published_docs (
    entity text NOT NULL,
    locale text NOT NULL,
    slug text NOT NULL,
    entity_id uuid NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    search_text text DEFAULT ''::text NOT NULL,
    body jsonb,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    written_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_keys (
    id boolean DEFAULT true NOT NULL,
    public_key text NOT NULL,
    private_key bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_keys_single_row CHECK (id)
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_push_subs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_push_subs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_push_subs_endpoint_check CHECK ((btrim(endpoint) <> ''::text))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb,
    value_encrypted bytea,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT system_settings_value_xor CHECK ((NOT ((value IS NOT NULL) AND (value_encrypted IS NOT NULL))))
);


--
-- Name: translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.translations (
    entity text NOT NULL,
    entity_id uuid NOT NULL,
    locale text NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: two_factor_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor_secrets (
    user_id uuid NOT NULL,
    secret_encrypted bytea NOT NULL,
    recovery_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled_at timestamp with time zone,
    last_used_step bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    avatar_path text,
    status text DEFAULT 'active'::text NOT NULL,
    email_verified_at timestamp with time zone,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'locked'::text])))
);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_providers ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_providers
    ADD CONSTRAINT ai_providers_pkey PRIMARY KEY (id);


--
-- Name: ai_purpose_models ai_purpose_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_purpose_models
    ADD CONSTRAINT ai_purpose_models_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_daily ai_usage_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_daily
    ADD CONSTRAINT ai_usage_daily_pkey PRIMARY KEY (day);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_refresh_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash);


--
-- Name: cms_article_tags cms_article_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_article_tags
    ADD CONSTRAINT cms_article_tags_pkey PRIMARY KEY (article_id, tag_id);


--
-- Name: cms_articles cms_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_articles
    ADD CONSTRAINT cms_articles_pkey PRIMARY KEY (id);


--
-- Name: cms_articles cms_articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_articles
    ADD CONSTRAINT cms_articles_slug_key UNIQUE (slug);


--
-- Name: cms_categories cms_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_categories
    ADD CONSTRAINT cms_categories_pkey PRIMARY KEY (id);


--
-- Name: cms_categories cms_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_categories
    ADD CONSTRAINT cms_categories_slug_key UNIQUE (slug);


--
-- Name: cms_comments cms_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_comments
    ADD CONSTRAINT cms_comments_pkey PRIMARY KEY (id);


--
-- Name: cms_landing_pages cms_landing_pages_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_landing_pages
    ADD CONSTRAINT cms_landing_pages_key_key UNIQUE (key);


--
-- Name: cms_landing_pages cms_landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_landing_pages
    ADD CONSTRAINT cms_landing_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_landing_sections cms_landing_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_landing_sections
    ADD CONSTRAINT cms_landing_sections_pkey PRIMARY KEY (id);


--
-- Name: cms_menu_items cms_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_menu_items
    ADD CONSTRAINT cms_menu_items_pkey PRIMARY KEY (id);


--
-- Name: cms_menus cms_menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_menus
    ADD CONSTRAINT cms_menus_pkey PRIMARY KEY (id);


--
-- Name: cms_newsletter_subscribers cms_newsletter_subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_newsletter_subscribers
    ADD CONSTRAINT cms_newsletter_subscribers_email_key UNIQUE (email);


--
-- Name: cms_newsletter_subscribers cms_newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_newsletter_subscribers
    ADD CONSTRAINT cms_newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_parent_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_parent_id_slug_key UNIQUE (parent_id, slug);


--
-- Name: cms_pages cms_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_region_blocks cms_region_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_region_blocks
    ADD CONSTRAINT cms_region_blocks_pkey PRIMARY KEY (id);


--
-- Name: cms_tags cms_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_tags
    ADD CONSTRAINT cms_tags_pkey PRIMARY KEY (id);


--
-- Name: cms_tags cms_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_tags
    ADD CONSTRAINT cms_tags_slug_key UNIQUE (slug);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: files files_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_slug_key UNIQUE (slug);


--
-- Name: files files_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_storage_key_key UNIQUE (storage_key);


--
-- Name: goose_db_version goose_db_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goose_db_version
    ADD CONSTRAINT goose_db_version_pkey PRIMARY KEY (id);


--
-- Name: lead_products lead_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_products
    ADD CONSTRAINT lead_products_pkey PRIMARY KEY (lead_id, product_id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: mcp_tokens mcp_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tokens
    ADD CONSTRAINT mcp_tokens_pkey PRIMARY KEY (id);


--
-- Name: mcp_tokens mcp_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tokens
    ADD CONSTRAINT mcp_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: members members_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_slug_key UNIQUE (slug);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_slug_key UNIQUE (slug);


--
-- Name: product_category_links product_category_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_links
    ADD CONSTRAINT product_category_links_pkey PRIMARY KEY (product_id, category_id);


--
-- Name: product_media product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);


--
-- Name: product_members product_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_members_pkey PRIMARY KEY (product_id, member_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: published_docs published_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_docs
    ADD CONSTRAINT published_docs_pkey PRIMARY KEY (entity, locale, slug);


--
-- Name: push_keys push_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_keys
    ADD CONSTRAINT push_keys_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: staff_push_subs staff_push_subs_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_push_subs
    ADD CONSTRAINT staff_push_subs_endpoint_key UNIQUE (endpoint);


--
-- Name: staff_push_subs staff_push_subs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_push_subs
    ADD CONSTRAINT staff_push_subs_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: translations translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_pkey PRIMARY KEY (entity, entity_id, locale);


--
-- Name: two_factor_secrets two_factor_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_secrets
    ADD CONSTRAINT two_factor_secrets_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ai_purpose_models_purpose_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_purpose_models_purpose_idx ON public.ai_purpose_models USING btree (purpose, sort_order);


--
-- Name: idx_activity_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_action ON public.activity_log USING btree (action, occurred_at DESC);


--
-- Name: idx_activity_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_actor ON public.activity_log USING btree (actor_id, occurred_at DESC);


--
-- Name: idx_activity_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_entity ON public.activity_log USING btree (entity, entity_id, occurred_at DESC);


--
-- Name: idx_activity_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_recent ON public.activity_log USING btree (occurred_at DESC);


--
-- Name: idx_ai_conv_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conv_inbox ON public.ai_conversations USING btree (state, last_activity_at DESC);


--
-- Name: idx_ai_conv_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conv_visitor ON public.ai_conversations USING btree (visitor_key, last_activity_at DESC);


--
-- Name: idx_ai_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_messages_conv ON public.ai_messages USING btree (conversation_id, created_at);


--
-- Name: idx_auth_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_expires ON public.auth_sessions USING btree (expires_at);


--
-- Name: idx_auth_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_sessions_user ON public.auth_sessions USING btree (user_id);


--
-- Name: idx_cms_article_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_article_tags_tag ON public.cms_article_tags USING btree (tag_id);


--
-- Name: idx_cms_articles_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_articles_author ON public.cms_articles USING btree (author_id);


--
-- Name: idx_cms_articles_cat_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_articles_cat_status ON public.cms_articles USING btree (category_id, status);


--
-- Name: idx_cms_articles_status_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_articles_status_pub ON public.cms_articles USING btree (status, published_at DESC);


--
-- Name: idx_cms_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_categories_parent ON public.cms_categories USING btree (parent_id, sort_order);


--
-- Name: idx_cms_comments_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_comments_article ON public.cms_comments USING btree (article_id, status, created_at DESC);


--
-- Name: idx_cms_comments_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_comments_queue ON public.cms_comments USING btree (status, created_at DESC);


--
-- Name: idx_cms_landing_sections_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_landing_sections_order ON public.cms_landing_sections USING btree (landing_page_id, sort_order);


--
-- Name: idx_cms_landing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_landing_status ON public.cms_landing_pages USING btree (status);


--
-- Name: idx_cms_menu_items_tree; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_menu_items_tree ON public.cms_menu_items USING btree (menu_id, parent_id, sort_order);


--
-- Name: idx_cms_newsletter_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_newsletter_created ON public.cms_newsletter_subscribers USING btree (created_at DESC);


--
-- Name: idx_cms_pages_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_pages_parent ON public.cms_pages USING btree (parent_id, sort_order);


--
-- Name: idx_cms_pages_root_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cms_pages_root_slug ON public.cms_pages USING btree (slug) WHERE (parent_id IS NULL);


--
-- Name: idx_cms_pages_status_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_pages_status_pub ON public.cms_pages USING btree (status, published_at DESC);


--
-- Name: idx_cms_region_blocks_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_region_blocks_slot ON public.cms_region_blocks USING btree (page_group, region, sort_order);


--
-- Name: idx_files_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_owner ON public.files USING btree (owner_kind, owner_id);


--
-- Name: idx_lead_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_products_product ON public.lead_products USING btree (product_id);


--
-- Name: idx_leads_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned ON public.leads USING btree (assigned_member_id, status, created_at DESC);


--
-- Name: idx_leads_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_inbox ON public.leads USING btree (status, created_at DESC);


--
-- Name: idx_mcp_tokens_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tokens_lookup ON public.mcp_tokens USING btree (token_hash) WHERE (revoked_at IS NULL);


--
-- Name: idx_mcp_tokens_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tokens_owner ON public.mcp_tokens USING btree (user_id, created_at DESC);


--
-- Name: idx_members_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_listing ON public.members USING btree (is_active, sort_order, full_name);


--
-- Name: idx_pcl_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcl_category ON public.product_category_links USING btree (category_id);


--
-- Name: idx_pm_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_member ON public.product_members USING btree (member_id);


--
-- Name: idx_product_categories_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_categories_sort ON public.product_categories USING btree (sort_order, name);


--
-- Name: idx_product_media_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_media_order ON public.product_media USING btree (product_id, sort_order);


--
-- Name: idx_products_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_lifecycle ON public.products USING btree (lifecycle);


--
-- Name: idx_products_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_listing ON public.products USING btree (is_featured DESC, sort_order, name);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status, published_at DESC);


--
-- Name: idx_prt_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_expires ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_prt_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_pubdocs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pubdocs_entity ON public.published_docs USING btree (entity, entity_id);


--
-- Name: idx_pubdocs_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pubdocs_list ON public.published_docs USING btree (entity, locale, published_at DESC) WHERE (is_current AND (body IS NOT NULL));


--
-- Name: idx_pubdocs_one_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pubdocs_one_live ON public.published_docs USING btree (entity, entity_id, locale) WHERE is_current;


--
-- Name: idx_pubdocs_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pubdocs_search ON public.published_docs USING gin (search_text public.gin_trgm_ops);


--
-- Name: idx_role_permissions_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_permission ON public.role_permissions USING btree (permission_id);


--
-- Name: idx_system_settings_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_updated_by ON public.system_settings USING btree (updated_by);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role_id);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: staff_push_subs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_push_subs_user_idx ON public.staff_push_subs USING btree (user_id);


--
-- Name: ai_conversations ai_conversations_claimed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_claimed_by_user_id_fkey FOREIGN KEY (claimed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_conversations ai_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: ai_conversations ai_conversations_referrer_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_referrer_member_id_fkey FOREIGN KEY (referrer_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: ai_messages ai_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_purpose_models ai_purpose_models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_purpose_models
    ADD CONSTRAINT ai_purpose_models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.ai_providers(id) ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cms_article_tags cms_article_tags_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_article_tags
    ADD CONSTRAINT cms_article_tags_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.cms_articles(id) ON DELETE CASCADE;


--
-- Name: cms_article_tags cms_article_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_article_tags
    ADD CONSTRAINT cms_article_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.cms_tags(id) ON DELETE CASCADE;


--
-- Name: cms_articles cms_articles_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_articles
    ADD CONSTRAINT cms_articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cms_articles cms_articles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_articles
    ADD CONSTRAINT cms_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.cms_categories(id) ON DELETE SET NULL;


--
-- Name: cms_categories cms_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_categories
    ADD CONSTRAINT cms_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cms_categories(id) ON DELETE RESTRICT;


--
-- Name: cms_comments cms_comments_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_comments
    ADD CONSTRAINT cms_comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.cms_articles(id) ON DELETE CASCADE;


--
-- Name: cms_comments cms_comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_comments
    ADD CONSTRAINT cms_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cms_comments cms_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_comments
    ADD CONSTRAINT cms_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cms_comments(id) ON DELETE CASCADE;


--
-- Name: cms_landing_sections cms_landing_sections_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_landing_sections
    ADD CONSTRAINT cms_landing_sections_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.cms_landing_pages(id) ON DELETE CASCADE;


--
-- Name: cms_menu_items cms_menu_items_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_menu_items
    ADD CONSTRAINT cms_menu_items_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.cms_menus(id) ON DELETE CASCADE;


--
-- Name: cms_menu_items cms_menu_items_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_menu_items
    ADD CONSTRAINT cms_menu_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cms_menu_items(id) ON DELETE CASCADE;


--
-- Name: cms_pages cms_pages_landing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_landing_id_fkey FOREIGN KEY (landing_id) REFERENCES public.cms_landing_pages(id) ON DELETE SET NULL;


--
-- Name: cms_pages cms_pages_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cms_pages(id) ON DELETE RESTRICT;


--
-- Name: cms_region_blocks cms_region_blocks_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_region_blocks
    ADD CONSTRAINT cms_region_blocks_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.cms_menus(id) ON DELETE CASCADE;


--
-- Name: lead_products lead_products_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_products
    ADD CONSTRAINT lead_products_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_products lead_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_products
    ADD CONSTRAINT lead_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_member_id_fkey FOREIGN KEY (assigned_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: leads leads_conversation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_conversation_fk FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE SET NULL;


--
-- Name: mcp_tokens mcp_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tokens
    ADD CONSTRAINT mcp_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_category_links product_category_links_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_links
    ADD CONSTRAINT product_category_links_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE CASCADE;


--
-- Name: product_category_links product_category_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_links
    ADD CONSTRAINT product_category_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_members product_members_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: product_members product_members_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_members_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: staff_push_subs staff_push_subs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_push_subs
    ADD CONSTRAINT staff_push_subs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: two_factor_secrets two_factor_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_secrets
    ADD CONSTRAINT two_factor_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 9fF1C37NBblyczMgPeCaYqv0PHwIxQaGhF8nJjfausopx8TtXgk2Sr9ibT802lt

