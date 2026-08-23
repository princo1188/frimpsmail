-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: fn_mailbox_credentials_set(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_mailbox_credentials_set"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.credential_vault_ref IS NOT NULL
     AND (OLD IS NULL OR OLD.credential_vault_ref IS DISTINCT FROM NEW.credential_vault_ref)
     AND NEW.sync_status IN ('pending', 'error')
  THEN
    NEW.sync_status := 'pending';
    NEW.last_error  := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_staff_mfa_enrolled_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_staff_mfa_enrolled_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.mfa_enrolled = true
     AND (OLD IS NULL OR OLD.mfa_enrolled IS DISTINCT FROM NEW.mfa_enrolled)
  THEN
    UPDATE public.mailboxes
    SET sync_status = 'pending',
        last_error = NULL,
        updated_at = now()
    WHERE staff_user_id = NEW.id
      AND credential_vault_ref IS NOT NULL
      AND sync_status IN ('pending', 'error');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_my_mailbox_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_my_mailbox_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT id FROM mailboxes 
  WHERE staff_user_id = auth.uid()
     OR (organization_id = get_my_organization_id() AND is_admin());
$$;


--
-- Name: get_my_organization_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_my_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT organization_id FROM staff_users WHERE id = auth.uid() LIMIT 1;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role = 'admin' FROM staff_users WHERE id = auth.uid() LIMIT 1;
$$;


--
-- Name: update_thread_receipt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_thread_receipt"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.read_receipt_confirmed_at IS NOT NULL AND
     (OLD.read_receipt_confirmed_at IS NULL OR NEW.read_receipt_confirmed_at <> OLD.read_receipt_confirmed_at) THEN
    UPDATE threads
    SET latest_read_receipt_at = GREATEST(COALESCE(latest_read_receipt_at, '1970-01-01'), NEW.read_receipt_confirmed_at)
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: vault_create_secret("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."vault_create_secret"("secret" "text", "secret_name" "text" DEFAULT NULL::"text", "secret_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'public'
    AS $$
declare
  new_secret_id uuid;
begin
  new_secret_id := vault.create_secret(secret, secret_name, secret_description);
  return new_secret_id;
end;
$$;


--
-- Name: vault_delete_secret("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."vault_delete_secret"("secret_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'public'
    AS $$
begin
  delete from vault.secrets where id = secret_id;
end;
$$;


--
-- Name: vault_read_secret("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."vault_read_secret"("secret_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'public'
    AS $$
declare
  decrypted text;
begin
  select decrypted_secret into decrypted
  from vault.decrypted_secrets
  where id = secret_id;
  return decrypted;
end;
$$;


--
-- Name: vault_update_secret("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."vault_update_secret"("secret_id" "uuid", "new_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'public'
    AS $$
begin
  perform vault.update_secret(secret_id, new_secret);
end;
$$;


--
-- Name: vault_upsert_secret("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."vault_upsert_secret"("p_secret" "text", "p_name" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Check if a secret with this name already exists
  SELECT id INTO v_id
  FROM vault.secrets
  WHERE name = p_name
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Update the existing secret
    PERFORM vault.update_secret(v_id, p_secret);
    RETURN v_id;
  ELSE
    -- Create a new secret and return its UUID
    v_id := vault.create_secret(p_secret, p_name, p_description);
    RETURN v_id;
  END IF;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: ai_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ai_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_cache_type_check" CHECK (("type" = ANY (ARRAY['summary'::"text", 'draft_suggestion'::"text", 'sentiment'::"text", 'categorization'::"text", 'meeting_extraction'::"text"])))
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "scopes" "text"[] DEFAULT ARRAY['read'::"text"],
    "is_active" boolean DEFAULT true,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "filename" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: calendar_event_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."calendar_event_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "location" "text",
    "attendees" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "agenda" "text",
    "department" "text" DEFAULT 'General'::"text" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "is_task" boolean DEFAULT false NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "recurrence_rule" "text",
    "recurrence_end_date" "date",
    "parent_event_id" "uuid",
    "reminder_minutes_before" integer,
    "reminder_sent_at" timestamp with time zone,
    CONSTRAINT "calendar_events_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'tentative'::"text", 'cancelled'::"text"])))
);


--
-- Name: contact_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."contact_group_members" (
    "group_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL
);


--
-- Name: contact_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."contact_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mailbox_id" "uuid"
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "company" "text",
    "phone" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "is_shared" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: feature_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."feature_interest" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "feature" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: follow_up_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."follow_up_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "remind_at" timestamp with time zone NOT NULL,
    "note" "text",
    "is_dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: mailbox_delegates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mailbox_delegates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "delegate_user_id" "uuid" NOT NULL,
    "permission_level" "text" DEFAULT 'read'::"text" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mailbox_delegates_permission_level_check" CHECK (("permission_level" = ANY (ARRAY['read'::"text", 'send'::"text", 'full'::"text"])))
);


--
-- Name: mailbox_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mailbox_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "imap_folder_name" "text" NOT NULL,
    "normalized_type" "text",
    "display_name" "text",
    CONSTRAINT "mailbox_folders_normalized_type_check" CHECK (("normalized_type" = ANY (ARRAY['inbox'::"text", 'sent'::"text", 'drafts'::"text", 'trash'::"text", 'spam'::"text", 'archive'::"text", 'custom'::"text"])))
);


--
-- Name: mailboxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mailboxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "staff_user_id" "uuid",
    "email_address" "text" NOT NULL,
    "display_name" "text",
    "imap_host" "text" NOT NULL,
    "imap_port" integer DEFAULT 993 NOT NULL,
    "smtp_host" "text" NOT NULL,
    "smtp_port" integer DEFAULT 587 NOT NULL,
    "credential_vault_ref" "text",
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ooo_enabled" boolean DEFAULT false,
    "ooo_subject" "text",
    "ooo_body_html" "text",
    "ooo_start_date" "date",
    "ooo_end_date" "date",
    "imap_tls_server_name" "text",
    "smtp_tls_server_name" "text",
    CONSTRAINT "mailboxes_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'syncing'::"text", 'active'::"text", 'error'::"text"])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "imap_uid" bigint,
    "imap_uidvalidity" bigint,
    "subject" "text",
    "from_address" "text",
    "from_name" "text",
    "to_addresses" "text"[] DEFAULT '{}'::"text"[],
    "cc_addresses" "text"[] DEFAULT '{}'::"text"[],
    "bcc_addresses" "text"[] DEFAULT '{}'::"text"[],
    "body_html" "text",
    "body_text" "text",
    "sent_at" timestamp with time zone,
    "is_read" boolean DEFAULT false,
    "is_flagged" boolean DEFAULT false,
    "spam_score" numeric,
    "spam_status" "text" DEFAULT 'clean'::"text",
    "raw_headers" "jsonb" DEFAULT '{}'::"jsonb",
    "read_receipt_confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "messages_spam_status_check" CHECK (("spam_status" = ANY (ARRAY['clean'::"text", 'flagged'::"text", 'confirmed_spam'::"text"])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "push_enabled" boolean DEFAULT true NOT NULL,
    "sound_enabled" boolean DEFAULT false NOT NULL,
    "badge_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sound_preset" "text" DEFAULT 'chime'::"text",
    "custom_sound_url" "text"
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "branding_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: outbound_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."outbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "to_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cc_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "bcc_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body_html" "text",
    "reply_to_message_id" "uuid",
    "attachments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "message_id" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outbound_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


--
-- Name: resource_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."resource_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "calendar_event_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resources_type_check" CHECK (("type" = ANY (ARRAY['room'::"text", 'vehicle'::"text", 'equipment'::"text", 'other'::"text"])))
);


--
-- Name: rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "condition_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."saved_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "query" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text" DEFAULT 'search'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "filters" "jsonb" DEFAULT '{}'::"jsonb"
);

COMMENT ON COLUMN "public"."saved_searches"."query" IS 'Plain search text used to repopulate the mail search field.';


--
-- Name: scheduled_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."scheduled_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "to_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cc_addresses" "text"[] DEFAULT '{}'::"text"[],
    "subject" "text",
    "body_html" "text",
    "attachments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "send_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scheduled_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


--
-- Name: security_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."security_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "staff_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "body_html" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: spam_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."spam_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "confidence" numeric,
    "reason" "text",
    "user_action" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "spam_flags_source_check" CHECK (("source" = ANY (ARRAY['spamassassin'::"text", 'ai_second_pass'::"text"]))),
    CONSTRAINT "spam_flags_user_action_check" CHECK (("user_action" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'dismissed'::"text"])))
);


--
-- Name: staff_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."staff_users" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mfa_enrolled" boolean DEFAULT false NOT NULL,
    "mfa_enrolled_at" timestamp with time zone,
    CONSTRAINT "staff_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))
);


--
-- Name: COLUMN "staff_users"."mfa_enrolled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."staff_users"."mfa_enrolled" IS 'True once user has confirmed TOTP enrollment';


--
-- Name: COLUMN "staff_users"."mfa_enrolled_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."staff_users"."mfa_enrolled_at" IS 'Timestamp of first successful MFA enrollment';


--
-- Name: threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mailbox_id" "uuid" NOT NULL,
    "subject" "text",
    "participants" "text"[] DEFAULT '{}'::"text"[],
    "last_message_at" timestamp with time zone,
    "is_read" boolean DEFAULT false,
    "is_starred" boolean DEFAULT false,
    "labels" "text"[] DEFAULT '{}'::"text"[],
    "folder_id" "uuid",
    "snoozed_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "follow_up_at" timestamp with time zone,
    "follow_up_note" "text",
    "latest_read_receipt_at" timestamp with time zone
);


--
-- Name: webhook_delivery_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."webhook_delivery_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "webhook_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "payload" "jsonb",
    "response_status" integer,
    "response_body" "text",
    "delivered_at" timestamp with time zone DEFAULT "now"(),
    "success" boolean DEFAULT false
);


--
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."webhook_endpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "events" "text"[] DEFAULT ARRAY['message.received'::"text", 'thread.updated'::"text"],
    "secret_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "is_active" boolean DEFAULT true,
    "last_triggered_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: ai_cache ai_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ai_cache_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ai_cache'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ai_cache"
    ADD CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'api_keys_key_hash_key'
      AND n.nspname = 'public'
      AND c.relname = 'api_keys'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'api_keys_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'api_keys'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'attachments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_event_attachments calendar_event_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_event_attachments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_event_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_event_attachments"
    ADD CONSTRAINT "calendar_event_attachments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_events_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_group_members contact_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_group_members_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_group_members'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_group_members"
    ADD CONSTRAINT "contact_group_members_pkey" PRIMARY KEY ("group_id", "contact_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_groups contact_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_groups_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_groups'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_groups"
    ADD CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contacts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'email_templates_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: feature_interest feature_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'feature_interest_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'feature_interest'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: follow_up_reminders follow_up_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'follow_up_reminders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'follow_up_reminders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."follow_up_reminders"
    ADD CONSTRAINT "follow_up_reminders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_mailbox_id_delegate_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_delegates_mailbox_id_delegate_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_delegates"
    ADD CONSTRAINT "mailbox_delegates_mailbox_id_delegate_user_id_key" UNIQUE ("mailbox_id", "delegate_user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_delegates_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_delegates"
    ADD CONSTRAINT "mailbox_delegates_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders mailbox_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_folders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_folders"
    ADD CONSTRAINT "mailbox_folders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailboxes_email_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailboxes_email_address_key'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailboxes"
    ADD CONSTRAINT "mailboxes_email_address_key" UNIQUE ("email_address");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailboxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailboxes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailboxes"
    ADD CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_mailbox_id_imap_uid_imap_uidvalidity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'messages_mailbox_id_imap_uid_imap_uidvalidity_key'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_mailbox_id_imap_uid_imap_uidvalidity_key" UNIQUE ("mailbox_id", "imap_uid", "imap_uidvalidity");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'messages_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notification_preferences_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'notification_preferences'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_preferences notification_preferences_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notification_preferences_user_unique'
      AND n.nspname = 'public'
      AND c.relname = 'notification_preferences'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_unique" UNIQUE ("staff_user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: organizations organizations_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'organizations_domain_key'
      AND n.nspname = 'public'
      AND c.relname = 'organizations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_domain_key" UNIQUE ("domain");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'organizations_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'organizations'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: outbound_messages outbound_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'outbound_messages_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'outbound_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resource_bookings resource_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'resource_bookings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'resource_bookings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."resource_bookings"
    ADD CONSTRAINT "resource_bookings_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'resources_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'resources'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rules_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rules"
    ADD CONSTRAINT "rules_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'saved_searches_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'saved_searches'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages scheduled_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'scheduled_messages_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."scheduled_messages"
    ADD CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log security_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'security_audit_log_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'security_audit_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'signatures_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."signatures"
    ADD CONSTRAINT "signatures_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: spam_flags spam_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'spam_flags_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'spam_flags'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."spam_flags"
    ADD CONSTRAINT "spam_flags_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users staff_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'staff_users_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'staff_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."staff_users"
    ADD CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'threads_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_delivery_logs webhook_delivery_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'webhook_delivery_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_delivery_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."webhook_delivery_logs"
    ADD CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'webhook_endpoints_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_endpoints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: idx_ai_cache_thread_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_cache_thread_type" ON "public"."ai_cache" USING "btree" ("thread_id", "type");


--
-- Name: idx_calendar_events_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_calendar_events_department" ON "public"."calendar_events" USING "btree" ("department");


--
-- Name: idx_calendar_events_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_calendar_events_parent" ON "public"."calendar_events" USING "btree" ("parent_event_id") WHERE ("parent_event_id" IS NOT NULL);


--
-- Name: idx_calendar_events_reminder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_calendar_events_reminder" ON "public"."calendar_events" USING "btree" ("reminder_minutes_before", "start_at") WHERE (("reminder_minutes_before" IS NOT NULL) AND ("reminder_sent_at" IS NULL));


--
-- Name: idx_contact_groups_mailbox_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_contact_groups_mailbox_id" ON "public"."contact_groups" USING "btree" ("mailbox_id");


--
-- Name: idx_email_templates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_email_templates_org" ON "public"."email_templates" USING "btree" ("organization_id", "category");


--
-- Name: idx_messages_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_messages_fts" ON "public"."messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("subject", ''::"text") || ' '::"text") || COALESCE("body_text", ''::"text")) || ' '::"text") || COALESCE("from_address", ''::"text"))));


--
-- Name: idx_messages_mailbox_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_messages_mailbox_id" ON "public"."messages" USING "btree" ("mailbox_id");


--
-- Name: idx_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_messages_sent_at" ON "public"."messages" USING "btree" ("sent_at" DESC);


--
-- Name: idx_messages_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_messages_thread_id" ON "public"."messages" USING "btree" ("thread_id");


--
-- Name: idx_outbound_messages_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_outbound_messages_status_created" ON "public"."outbound_messages" USING "btree" ("status", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'sending'::"text"]));


--
-- Name: idx_resource_bookings_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_resource_bookings_event" ON "public"."resource_bookings" USING "btree" ("calendar_event_id");


--
-- Name: idx_resource_bookings_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_resource_bookings_resource" ON "public"."resource_bookings" USING "btree" ("resource_id", "start_at", "end_at");


--
-- Name: idx_saved_searches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_saved_searches_user" ON "public"."saved_searches" USING "btree" ("staff_user_id");


--
-- Name: idx_security_audit_log_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_security_audit_log_org" ON "public"."security_audit_log" USING "btree" ("organization_id", "created_at" DESC);


--
-- Name: idx_security_audit_log_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_security_audit_log_staff" ON "public"."security_audit_log" USING "btree" ("staff_user_id", "created_at" DESC);


--
-- Name: idx_threads_folder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_threads_folder_id" ON "public"."threads" USING "btree" ("folder_id");


--
-- Name: idx_threads_follow_up; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_threads_follow_up" ON "public"."threads" USING "btree" ("follow_up_at") WHERE ("follow_up_at" IS NOT NULL);


--
-- Name: idx_threads_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_threads_last_message_at" ON "public"."threads" USING "btree" ("last_message_at" DESC);


--
-- Name: idx_threads_mailbox_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_threads_mailbox_id" ON "public"."threads" USING "btree" ("mailbox_id");


--
-- Name: mailboxes trg_mailbox_credentials_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_mailbox_credentials_set" BEFORE INSERT OR UPDATE OF "credential_vault_ref" ON "public"."mailboxes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_mailbox_credentials_set"();


--
-- Name: staff_users trg_staff_mfa_enrolled_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_staff_mfa_enrolled_sync" BEFORE UPDATE OF "mfa_enrolled" ON "public"."staff_users" FOR EACH ROW EXECUTE FUNCTION "public"."fn_staff_mfa_enrolled_sync"();


--
-- Name: messages trg_update_thread_receipt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_update_thread_receipt" AFTER UPDATE OF "read_receipt_confirmed_at" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_thread_receipt"();


--
-- Name: ai_cache ai_cache_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ai_cache_thread_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'ai_cache'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ai_cache"
    ADD CONSTRAINT "ai_cache_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'api_keys_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'api_keys'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: api_keys api_keys_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'api_keys_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'api_keys'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: attachments attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'attachments_message_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_event_attachments calendar_event_attachments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_event_attachments_event_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_event_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_event_attachments"
    ADD CONSTRAINT "calendar_event_attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_events_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_events_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_events_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'calendar_events_parent_event_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_group_members contact_group_members_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_group_members_contact_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_group_members'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_group_members"
    ADD CONSTRAINT "contact_group_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_group_members contact_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_group_members_group_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_group_members'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_group_members"
    ADD CONSTRAINT "contact_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_groups contact_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_groups_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_groups'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_groups"
    ADD CONSTRAINT "contact_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_groups contact_groups_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_groups_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_groups'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_groups"
    ADD CONSTRAINT "contact_groups_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_groups contact_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contact_groups_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contact_groups'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contact_groups"
    ADD CONSTRAINT "contact_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contacts_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'contacts_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'email_templates_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'email_templates_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: feature_interest feature_interest_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'feature_interest_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'feature_interest'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: follow_up_reminders follow_up_reminders_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'follow_up_reminders_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'follow_up_reminders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."follow_up_reminders"
    ADD CONSTRAINT "follow_up_reminders_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: follow_up_reminders follow_up_reminders_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'follow_up_reminders_thread_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'follow_up_reminders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."follow_up_reminders"
    ADD CONSTRAINT "follow_up_reminders_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_delegate_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_delegates_delegate_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_delegates"
    ADD CONSTRAINT "mailbox_delegates_delegate_user_id_fkey" FOREIGN KEY ("delegate_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_delegates_granted_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_delegates"
    ADD CONSTRAINT "mailbox_delegates_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_delegates_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_delegates"
    ADD CONSTRAINT "mailbox_delegates_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders mailbox_folders_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailbox_folders_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailbox_folders"
    ADD CONSTRAINT "mailbox_folders_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailboxes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailboxes_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailboxes"
    ADD CONSTRAINT "mailboxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailboxes_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'mailboxes_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."mailboxes"
    ADD CONSTRAINT "mailboxes_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'messages_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'messages_thread_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_preferences notification_preferences_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notification_preferences_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notification_preferences'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: outbound_messages outbound_messages_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'outbound_messages_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'outbound_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "outbound_messages_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: outbound_messages outbound_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'outbound_messages_reply_to_message_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'outbound_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "outbound_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resource_bookings resource_bookings_calendar_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'resource_bookings_calendar_event_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'resource_bookings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."resource_bookings"
    ADD CONSTRAINT "resource_bookings_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resource_bookings resource_bookings_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'resource_bookings_resource_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'resource_bookings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."resource_bookings"
    ADD CONSTRAINT "resource_bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resources resources_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'resources_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'resources'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rules rules_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rules_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rules"
    ADD CONSTRAINT "rules_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: saved_searches saved_searches_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'saved_searches_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'saved_searches'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages scheduled_messages_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'scheduled_messages_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."scheduled_messages"
    ADD CONSTRAINT "scheduled_messages_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log security_audit_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'security_audit_log_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'security_audit_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log security_audit_log_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'security_audit_log_staff_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'security_audit_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures signatures_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'signatures_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."signatures"
    ADD CONSTRAINT "signatures_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: spam_flags spam_flags_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'spam_flags_message_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'spam_flags'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."spam_flags"
    ADD CONSTRAINT "spam_flags_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users staff_users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'staff_users_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'staff_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."staff_users"
    ADD CONSTRAINT "staff_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users staff_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'staff_users_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'staff_users'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."staff_users"
    ADD CONSTRAINT "staff_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'threads_folder_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."mailbox_folders"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'threads_mailbox_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_delivery_logs webhook_delivery_logs_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'webhook_delivery_logs_webhook_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_delivery_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."webhook_delivery_logs"
    ADD CONSTRAINT "webhook_delivery_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_endpoints webhook_endpoints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'webhook_endpoints_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_endpoints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_endpoints webhook_endpoints_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'webhook_endpoints_organization_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_endpoints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log admins_read_org_audit_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admins_read_org_audit_logs'
      AND n.nspname = 'public'
      AND c.relname = 'security_audit_log'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admins_read_org_audit_logs" ON "public"."security_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."staff_users"
  WHERE (("staff_users"."id" = "auth"."uid"()) AND ("staff_users"."role" = 'admin'::"text") AND ("staff_users"."organization_id" = "security_audit_log"."organization_id")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_cache ai_cache_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_cache_insert'
      AND n.nspname = 'public'
      AND c.relname = 'ai_cache'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_cache_insert" ON "public"."ai_cache" FOR INSERT TO "authenticated" WITH CHECK (("thread_id" IN ( SELECT "threads"."id"
   FROM "public"."threads"
  WHERE ("threads"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_cache ai_cache_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_cache_select'
      AND n.nspname = 'public'
      AND c.relname = 'ai_cache'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_cache_select" ON "public"."ai_cache" FOR SELECT TO "authenticated" USING (("thread_id" IN ( SELECT "threads"."id"
   FROM "public"."threads"
  WHERE ("threads"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ai_cache ai_cache_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ai_cache_update'
      AND n.nspname = 'public'
      AND c.relname = 'ai_cache'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ai_cache_update" ON "public"."ai_cache" FOR UPDATE TO "authenticated" USING (("thread_id" IN ( SELECT "threads"."id"
   FROM "public"."threads"
  WHERE ("threads"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys api_keys_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'api_keys_all'
      AND n.nspname = 'public'
      AND c.relname = 'api_keys'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "api_keys_all" ON "public"."api_keys" USING ((("organization_id" = "public"."get_my_organization_id"()) AND "public"."is_admin"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments attachments_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'attachments_insert'
      AND n.nspname = 'public'
      AND c.relname = 'attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "attachments_insert" ON "public"."attachments" FOR INSERT TO "authenticated" WITH CHECK (("message_id" IN ( SELECT "messages"."id"
   FROM "public"."messages"
  WHERE ("messages"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: attachments attachments_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'attachments_select'
      AND n.nspname = 'public'
      AND c.relname = 'attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "attachments_select" ON "public"."attachments" FOR SELECT TO "authenticated" USING (("message_id" IN ( SELECT "messages"."id"
   FROM "public"."messages"
  WHERE ("messages"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log authenticated_insert_audit_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_insert_audit_logs'
      AND n.nspname = 'public'
      AND c.relname = 'security_audit_log'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_insert_audit_logs" ON "public"."security_audit_log" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'calendar_delete'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "calendar_delete" ON "public"."calendar_events" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_my_organization_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_admin"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_event_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."calendar_event_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events calendar_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'calendar_insert'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "calendar_insert" ON "public"."calendar_events" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'calendar_select'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "calendar_select" ON "public"."calendar_events" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: calendar_events calendar_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'calendar_update'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_events'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "calendar_update" ON "public"."calendar_events" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contact_group_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_group_members contact_group_members_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contact_group_members_all'
      AND n.nspname = 'public'
      AND c.relname = 'contact_group_members'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contact_group_members_all" ON "public"."contact_group_members" USING (("group_id" IN ( SELECT "contact_groups"."id"
   FROM "public"."contact_groups"
  WHERE ("contact_groups"."organization_id" = "public"."get_my_organization_id"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contact_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contact_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_groups contact_groups_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contact_groups_all'
      AND n.nspname = 'public'
      AND c.relname = 'contact_groups'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contact_groups_all" ON "public"."contact_groups" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contacts_delete'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contacts_delete" ON "public"."contacts" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contacts_insert'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contacts_insert" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contacts_select'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contacts_select" ON "public"."contacts" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: contacts contacts_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'contacts_update'
      AND n.nspname = 'public'
      AND c.relname = 'contacts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "contacts_update" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'email_templates_delete'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "email_templates_delete" ON "public"."email_templates" FOR DELETE USING ((("organization_id" = "public"."get_my_organization_id"()) AND (("created_by" = "auth"."uid"()) OR "public"."is_admin"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'email_templates_insert'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "email_templates_insert" ON "public"."email_templates" FOR INSERT WITH CHECK (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'email_templates_select'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "email_templates_select" ON "public"."email_templates" FOR SELECT USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: email_templates email_templates_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'email_templates_update'
      AND n.nspname = 'public'
      AND c.relname = 'email_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "email_templates_update" ON "public"."email_templates" FOR UPDATE USING (("organization_id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: feature_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."feature_interest" ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_interest feature_interest_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'feature_interest_insert'
      AND n.nspname = 'public'
      AND c.relname = 'feature_interest'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "feature_interest_insert" ON "public"."feature_interest" FOR INSERT TO "authenticated" WITH CHECK (("staff_user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: feature_interest feature_interest_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'feature_interest_select'
      AND n.nspname = 'public'
      AND c.relname = 'feature_interest'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "feature_interest_select" ON "public"."feature_interest" FOR SELECT TO "authenticated" USING (("staff_user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders folders_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'folders_delete'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "folders_delete" ON "public"."mailbox_folders" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders folders_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'folders_insert'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "folders_insert" ON "public"."mailbox_folders" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders folders_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'folders_select'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "folders_select" ON "public"."mailbox_folders" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders folders_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'folders_update'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_folders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "folders_update" ON "public"."mailbox_folders" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: follow_up_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."follow_up_reminders" ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_reminders follow_up_reminders_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'follow_up_reminders_all'
      AND n.nspname = 'public'
      AND c.relname = 'follow_up_reminders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "follow_up_reminders_all" ON "public"."follow_up_reminders" USING (("staff_user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailbox_admin_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_admin_delete'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_admin_delete" ON "public"."mailboxes" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("organization_id" = "public"."get_my_organization_id"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailbox_admin_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_admin_insert'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_admin_insert" ON "public"."mailboxes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("organization_id" = "public"."get_my_organization_id"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes mailbox_admin_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_admin_update'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_admin_update" ON "public"."mailboxes" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("organization_id" = "public"."get_my_organization_id"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mailbox_delegates" ENABLE ROW LEVEL SECURITY;

--
-- Name: mailbox_delegates mailbox_delegates_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_delegates_manage'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_delegates_manage" ON "public"."mailbox_delegates" USING ((("mailbox_id" IN ( SELECT "mailboxes"."id"
   FROM "public"."mailboxes"
  WHERE ("mailboxes"."staff_user_id" = "auth"."uid"()))) OR "public"."is_admin"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_delegates mailbox_delegates_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_delegates_select'
      AND n.nspname = 'public'
      AND c.relname = 'mailbox_delegates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_delegates_select" ON "public"."mailbox_delegates" USING ((("delegate_user_id" = "auth"."uid"()) OR ("mailbox_id" IN ( SELECT "mailboxes"."id"
   FROM "public"."mailboxes"
  WHERE ("mailboxes"."staff_user_id" = "auth"."uid"()))) OR "public"."is_admin"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailbox_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mailbox_folders" ENABLE ROW LEVEL SECURITY;

--
-- Name: mailboxes mailbox_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'mailbox_select'
      AND n.nspname = 'public'
      AND c.relname = 'mailboxes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "mailbox_select" ON "public"."mailboxes" FOR SELECT TO "authenticated" USING ((("staff_user_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("organization_id" = "public"."get_my_organization_id"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: mailboxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mailboxes" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'messages_delete'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "messages_delete" ON "public"."messages" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'messages_insert'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'messages_select'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: messages messages_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'messages_update'
      AND n.nspname = 'public'
      AND c.relname = 'messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_preferences notif_prefs_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notif_prefs_own'
      AND n.nspname = 'public'
      AND c.relname = 'notification_preferences'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "notif_prefs_own" ON "public"."notification_preferences" USING (("staff_user_id" = "auth"."uid"())) WITH CHECK (("staff_user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_event_attachments org_access_calendar_attachments; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'org_access_calendar_attachments'
      AND n.nspname = 'public'
      AND c.relname = 'calendar_event_attachments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "org_access_calendar_attachments" ON "public"."calendar_event_attachments" USING ((EXISTS ( SELECT 1
   FROM ("public"."calendar_events" "ce"
     JOIN "public"."staff_users" "su" ON (("su"."organization_id" = "ce"."organization_id")))
  WHERE (("ce"."id" = "calendar_event_attachments"."event_id") AND ("su"."id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resource_bookings org_access_resource_bookings; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'org_access_resource_bookings'
      AND n.nspname = 'public'
      AND c.relname = 'resource_bookings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "org_access_resource_bookings" ON "public"."resource_bookings" USING ((EXISTS ( SELECT 1
   FROM ("public"."resources" "r"
     JOIN "public"."staff_users" "su" ON (("su"."organization_id" = "r"."organization_id")))
  WHERE (("r"."id" = "resource_bookings"."resource_id") AND ("su"."id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resources org_access_resources; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'org_access_resources'
      AND n.nspname = 'public'
      AND c.relname = 'resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "org_access_resources" ON "public"."resources" USING (("organization_id" IN ( SELECT "staff_users"."organization_id"
   FROM "public"."staff_users"
  WHERE ("staff_users"."id" = "auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: organizations org_anon_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'org_anon_select'
      AND n.nspname = 'public'
      AND c.relname = 'organizations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "org_anon_select" ON "public"."organizations" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: organizations org_auth_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'org_auth_select'
      AND n.nspname = 'public'
      AND c.relname = 'organizations'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "org_auth_select" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("id" = "public"."get_my_organization_id"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."outbound_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_messages outbound_messages_service_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'outbound_messages_service_all'
      AND n.nspname = 'public'
      AND c.relname = 'outbound_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "outbound_messages_service_all" ON "public"."outbound_messages" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resource_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_bookings" ENABLE ROW LEVEL SECURITY;

--
-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;

--
-- Name: rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: rules rules_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rules_delete'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rules_delete" ON "public"."rules" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rules rules_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rules_insert'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rules_insert" ON "public"."rules" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rules rules_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rules_select'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rules_select" ON "public"."rules" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rules rules_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rules_update'
      AND n.nspname = 'public'
      AND c.relname = 'rules'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rules_update" ON "public"."rules" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."saved_searches" ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_searches saved_searches_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'saved_searches_all'
      AND n.nspname = 'public'
      AND c.relname = 'saved_searches'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "saved_searches_all" ON "public"."saved_searches" USING (("staff_user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages scheduled_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'scheduled_delete'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "scheduled_delete" ON "public"."scheduled_messages" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages scheduled_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'scheduled_insert'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "scheduled_insert" ON "public"."scheduled_messages" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."scheduled_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_messages scheduled_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'scheduled_select'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "scheduled_select" ON "public"."scheduled_messages" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: scheduled_messages scheduled_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'scheduled_update'
      AND n.nspname = 'public'
      AND c.relname = 'scheduled_messages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "scheduled_update" ON "public"."scheduled_messages" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: security_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."security_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_bookings service_role_resource_bookings; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_resource_bookings'
      AND n.nspname = 'public'
      AND c.relname = 'resource_bookings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_resource_bookings" ON "public"."resource_bookings" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: resources service_role_resources; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_role_resources'
      AND n.nspname = 'public'
      AND c.relname = 'resources'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_role_resources" ON "public"."resources" TO "service_role" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."signatures" ENABLE ROW LEVEL SECURITY;

--
-- Name: signatures signatures_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'signatures_delete'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "signatures_delete" ON "public"."signatures" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures signatures_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'signatures_insert'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "signatures_insert" ON "public"."signatures" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures signatures_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'signatures_select'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "signatures_select" ON "public"."signatures" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: signatures signatures_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'signatures_update'
      AND n.nspname = 'public'
      AND c.relname = 'signatures'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "signatures_update" ON "public"."signatures" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: spam_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."spam_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: spam_flags spam_flags_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'spam_flags_insert'
      AND n.nspname = 'public'
      AND c.relname = 'spam_flags'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "spam_flags_insert" ON "public"."spam_flags" FOR INSERT TO "authenticated" WITH CHECK (("message_id" IN ( SELECT "messages"."id"
   FROM "public"."messages"
  WHERE ("messages"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: spam_flags spam_flags_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'spam_flags_select'
      AND n.nspname = 'public'
      AND c.relname = 'spam_flags'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "spam_flags_select" ON "public"."spam_flags" FOR SELECT TO "authenticated" USING (("message_id" IN ( SELECT "messages"."id"
   FROM "public"."messages"
  WHERE ("messages"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: spam_flags spam_flags_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'spam_flags_update'
      AND n.nspname = 'public'
      AND c.relname = 'spam_flags'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "spam_flags_update" ON "public"."spam_flags" FOR UPDATE TO "authenticated" USING (("message_id" IN ( SELECT "messages"."id"
   FROM "public"."messages"
  WHERE ("messages"."mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users staff_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'staff_select'
      AND n.nspname = 'public'
      AND c.relname = 'staff_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "staff_select" ON "public"."staff_users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("organization_id" = "public"."get_my_organization_id"())));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users staff_update_own; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'staff_update_own'
      AND n.nspname = 'public'
      AND c.relname = 'staff_users'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "staff_update_own" ON "public"."staff_users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;

--
-- Name: threads threads_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'threads_delete'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "threads_delete" ON "public"."threads" FOR DELETE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'threads_insert'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "threads_insert" ON "public"."threads" FOR INSERT TO "authenticated" WITH CHECK (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'threads_select'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "threads_select" ON "public"."threads" FOR SELECT TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: threads threads_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'threads_update'
      AND n.nspname = 'public'
      AND c.relname = 'threads'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "threads_update" ON "public"."threads" FOR UPDATE TO "authenticated" USING (("mailbox_id" IN ( SELECT "public"."get_my_mailbox_ids"() AS "get_my_mailbox_ids")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_delivery_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."webhook_delivery_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_endpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."webhook_endpoints" ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_endpoints webhook_endpoints_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'webhook_endpoints_all'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_endpoints'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "webhook_endpoints_all" ON "public"."webhook_endpoints" USING ((("organization_id" = "public"."get_my_organization_id"()) AND "public"."is_admin"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: webhook_delivery_logs webhook_logs_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'webhook_logs_select'
      AND n.nspname = 'public'
      AND c.relname = 'webhook_delivery_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "webhook_logs_select" ON "public"."webhook_delivery_logs" USING (("webhook_id" IN ( SELECT "webhook_endpoints"."id"
   FROM "public"."webhook_endpoints"
  WHERE ("webhook_endpoints"."organization_id" = "public"."get_my_organization_id"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- policy: attachments_auth_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'attachments_auth_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY attachments_auth_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''attachments''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: attachments_auth_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'attachments_auth_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY attachments_auth_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = ''attachments''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: logos_auth_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'logos_auth_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY logos_auth_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''logos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: logos_public_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'logos_public_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY logos_public_select ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((bucket_id = ''logos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: notification_sounds_own_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notification_sounds_own_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY notification_sounds_own_delete ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = ''notification-sounds''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: notification_sounds_own_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notification_sounds_own_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY notification_sounds_own_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = ''notification-sounds''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- policy: notification_sounds_own_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'notification_sounds_own_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY notification_sounds_own_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = ''notification-sounds''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.calendar_events
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.calendar_events')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.mailboxes
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.mailboxes')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.mailboxes;';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.messages
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.messages')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;';
  END IF;
END
$pg_schema_restore$;
-- publication table: supabase_realtime -> public.threads
DO $pg_schema_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = to_regclass('public.threads')
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('attachments', 'attachments', NULL, '2026-07-03 06:08:05.473223+00', '2026-07-03 06:08:05.473223+00', 'false', 'false', '52428800', NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('logos', 'logos', NULL, '2026-07-03 06:08:05.473223+00', '2026-07-03 06:08:05.473223+00', 'true', 'false', '5242880', NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('notification-sounds', 'notification-sounds', NULL, '2026-07-03 09:00:18.493148+00', '2026-07-03 09:00:18.493148+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";

-- ============================================================
-- SECTION: CRON JOBS
-- ============================================================
-- 用户自定义 pg_cron 任务。
