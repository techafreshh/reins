ALTER TABLE "threads" ADD COLUMN "stakeholder" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "snippet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "last_message_at" text DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "promised_date_missed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "staleness_days" integer DEFAULT 0 NOT NULL;