CREATE TABLE "program_phase_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"template_id" text NOT NULL,
	"day_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_phases" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"order_index" integer NOT NULL,
	"target_session_count" integer NOT NULL,
	"completed_session_count" integer DEFAULT 0 NOT NULL,
	"split_type" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"proposed_changes" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"experience_level" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "training_days" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "session_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "program_phase_id" text;--> statement-breakpoint
ALTER TABLE "program_phase_templates" ADD CONSTRAINT "program_phase_templates_phase_id_program_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."program_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_phase_templates" ADD CONSTRAINT "program_phase_templates_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_phases" ADD CONSTRAINT "program_phases_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_updates" ADD CONSTRAINT "program_updates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_phase_id_program_phases_id_fk" FOREIGN KEY ("program_phase_id") REFERENCES "public"."program_phases"("id") ON DELETE no action ON UPDATE no action;