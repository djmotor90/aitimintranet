ALTER TABLE "spaces" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "deleted_at" timestamp with time zone;
