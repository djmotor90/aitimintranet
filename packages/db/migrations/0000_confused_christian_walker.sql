CREATE TYPE "public"."mapping_target_type" AS ENUM('platform_role', 'space_role', 'module_access');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'textarea', 'number', 'date', 'dropdown', 'multi_select', 'user', 'checkbox', 'url', 'email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."email_digest" AS ENUM('instant', 'hourly', 'off');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('assigned', 'mentioned', 'comment', 'status_changed', 'due_soon', 'form_submission');--> statement-breakpoint
CREATE TYPE "public"."principal_type" AS ENUM('user', 'group');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('owner', 'member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."status_category" AS ENUM('open', 'active', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('urgent', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manual', 'public_form');--> statement-breakpoint
CREATE TABLE "entra_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_group_id" text NOT NULL,
	"display_name" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entra_groups_entra_group_id_unique" UNIQUE("entra_group_id")
);
--> statement-breakpoint
CREATE TABLE "group_role_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"target_type" "mapping_target_type" NOT NULL,
	"target_id" uuid,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_memberships" (
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "user_group_memberships_user_id_group_id_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_object_id" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"job_title" text,
	"department" text,
	"manager_id" uuid,
	"photo_key" text,
	"platform_role" "platform_role" DEFAULT 'member' NOT NULL,
	"is_protected_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_object_id_unique" UNIQUE("entra_object_id")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"task_id" uuid,
	"actor_id" uuid,
	"actor_label" text,
	"verb" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"comment_id" uuid,
	"uploader_id" uuid,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_mentions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "comment_mentions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"position" text DEFAULT 'a0' NOT NULL,
	"default_status_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email_digest" "email_digest" DEFAULT 'instant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"task_id" uuid,
	"actor_id" uuid,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"user_id" uuid,
	"group_id" uuid,
	"role" "space_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_task_counters" (
	"space_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"task_prefix" text NOT NULL,
	"icon" text,
	"color" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#94a3b8' NOT NULL,
	"category" "status_category" DEFAULT 'open' NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" jsonb,
	"status_id" uuid NOT NULL,
	"priority" "task_priority",
	"due_date" date,
	"start_date" date,
	"position" text DEFAULT 'a0' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"completed_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"task_id" uuid,
	"raw_payload" jsonb NOT NULL,
	"submitter_email" text,
	"submitter_name" text,
	"ip_hash" text,
	"turnstile_ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"intro_md" text,
	"success_message" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notify_space_role" text DEFAULT 'owner' NOT NULL,
	"fields" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "group_role_mappings" ADD CONSTRAINT "group_role_mappings_group_id_entra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."entra_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_group_id_entra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."entra_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_task_counters" ADD CONSTRAINT "space_task_counters_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_public_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."public_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_forms" ADD CONSTRAINT "public_forms_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_role_mappings_group_idx" ON "group_role_mappings" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_manager_idx" ON "users" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "activity_log_task_idx" ON "activity_log" USING btree ("task_id","id" desc);--> statement-breakpoint
CREATE INDEX "attachments_task_idx" ON "attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "comment_mentions_user_idx" ON "comment_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_task_idx" ON "comments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_defs_list_key_idx" ON "custom_field_definitions" USING btree ("list_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_space_slug_idx" ON "lists" USING btree ("space_id","slug");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "space_members_user_idx" ON "space_members" USING btree ("space_id","user_id") WHERE "space_members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "space_members_group_idx" ON "space_members" USING btree ("space_id","group_id") WHERE "space_members"."group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_slug_idx" ON "spaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "statuses_list_idx" ON "statuses" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "task_assignees_user_idx" ON "task_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_number_idx" ON "tasks" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tasks_list_status_idx" ON "tasks" USING btree ("list_id","status_id");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_custom_fields_gin_idx" ON "tasks" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id","created_at");