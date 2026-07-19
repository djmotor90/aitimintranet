CREATE TABLE "list_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'table' NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_by" text,
	"show_closed" boolean DEFAULT false NOT NULL,
	"table_column_order" jsonb,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_views" ADD CONSTRAINT "list_views_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_views" ADD CONSTRAINT "list_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_views_list_idx" ON "list_views" USING btree ("list_id");--> statement-breakpoint
-- Seed default List (table) + Board views from legacy list prefs.
INSERT INTO "list_views" ("list_id", "name", "type", "filters", "group_by", "show_closed", "table_column_order", "position")
SELECT l."id", 'List', 'table', '[]'::jsonb, l."default_group_by", false, l."table_column_order", 'a0'
FROM "lists" l;
--> statement-breakpoint
INSERT INTO "list_views" ("list_id", "name", "type", "filters", "group_by", "show_closed", "table_column_order", "position")
SELECT l."id", 'Board', 'board', '[]'::jsonb, NULL, false, NULL, 'a1'
FROM "lists" l;
