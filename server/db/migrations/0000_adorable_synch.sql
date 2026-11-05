CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"payload" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"effect_id" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learnings" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text DEFAULT '' NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"rule" text DEFAULT '' NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "policies_capability_unique" UNIQUE("capability")
);
--> statement-breakpoint
CREATE TABLE "proposed_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_job_id_idx" ON "audit_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "decisions_job_id_idx" ON "decisions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "decisions_effect_id_idx" ON "decisions" USING btree ("effect_id");--> statement-breakpoint
CREATE INDEX "learnings_job_id_idx" ON "learnings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_job_id_idx" ON "messages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "proposed_effects_job_id_idx" ON "proposed_effects" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "threads_job_id_idx" ON "threads" USING btree ("job_id");