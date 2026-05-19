CREATE TABLE "progression_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"suggested_sets" integer NOT NULL,
	"suggested_reps" integer NOT NULL,
	"suggested_weight_kg" real NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"age" integer,
	"height_cm" integer,
	"experience_level" text,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progression_suggestions" ADD CONSTRAINT "progression_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progression_suggestions" ADD CONSTRAINT "progression_suggestions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "progression_suggestions_user_exercise" ON "progression_suggestions" USING btree ("user_id","exercise_id");