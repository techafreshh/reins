ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'planning';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "template" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "status" = 'planning' WHERE "status" = 'proposed';