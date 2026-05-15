CREATE TABLE "body_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"recorded_at" integer NOT NULL,
	"chest" real,
	"waist" real,
	"hips" real,
	"left_bicep" real,
	"right_bicep" real,
	"left_thigh" real,
	"right_thigh" real,
	"shoulders" real,
	"neck" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "body_weights" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"weight_kg" real NOT NULL,
	"recorded_at" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"category" text,
	"equipment" text,
	"notes" text,
	"is_default" integer DEFAULT 0,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"recorded_at" integer NOT NULL,
	"file_path" text NOT NULL,
	"thumb_path" text NOT NULL,
	"body_weight" real,
	"tags" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"exercise_id" text,
	"set_number" integer NOT NULL,
	"reps" integer,
	"weight_kg" real,
	"duration_sec" integer,
	"rpe" real,
	"completed_at" integer,
	"done" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"exercise_id" text,
	"order_index" integer NOT NULL,
	"default_sets" integer,
	"default_reps" integer,
	"default_weight_kg" real
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"template_id" text,
	"type" text NOT NULL,
	"scheduled_date" text,
	"day_of_week" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"template_id" text,
	"name" text NOT NULL,
	"started_at" integer NOT NULL,
	"finished_at" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"notes" text,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_weights" ADD CONSTRAINT "body_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_schedules" ADD CONSTRAINT "workout_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_schedules" ADD CONSTRAINT "workout_schedules_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;