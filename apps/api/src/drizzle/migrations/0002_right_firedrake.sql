CREATE TABLE "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text,
	"name" text NOT NULL,
	"equipment_type" text,
	"description" text,
	"tags" text,
	"photo_path" text NOT NULL,
	"thumb_path" text NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_exercises" (
	"equipment_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	CONSTRAINT "equipment_exercises_equipment_id_exercise_id_pk" PRIMARY KEY("equipment_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "equipment_id" text;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD COLUMN "equipment_id" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_exercises" ADD CONSTRAINT "equipment_exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_exercises" ADD CONSTRAINT "equipment_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;