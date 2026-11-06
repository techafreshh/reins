ALTER TABLE "learnings" ADD COLUMN "from_effect_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learnings" ADD COLUMN "rule" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learnings" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;