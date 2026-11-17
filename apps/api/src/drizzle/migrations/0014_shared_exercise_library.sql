-- Shared Exercise library (ADR 0012). Hand-edited around the drizzle-kit output so the data steps
-- run before the columns they read are dropped and before the unique name index is built:
--   1. user_exercise_notes table
--   2. merge case-insensitive duplicate names into one surviving Exercise
--   3. move non-empty exercises.notes to user_exercise_notes
--   4. archived_at, unique lower(name) index, drop user_id / notes / is_default
-- Image files are moved out of the per-User folder by the API at boot
-- (apps/api/src/exercises/exercise-images.ts), not here.
CREATE TABLE "user_exercise_notes" (
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"notes" text NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "user_exercise_notes_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "user_exercise_notes" ADD CONSTRAINT "user_exercise_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exercise_notes" ADD CONSTRAINT "user_exercise_notes_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 2. Duplicate merge. Per case-insensitive name, keep one Exercise: a custom (is_default = 0) copy
-- over a seeded one, then the most referenced, then the oldest. Every other copy is merged into it.
CREATE TABLE "_exercise_merge" AS
WITH "refs" AS (
	SELECT "e"."id",
		(SELECT count(*) FROM "sets" WHERE "exercise_id" = "e"."id")
		+ (SELECT count(*) FROM "template_exercises" WHERE "exercise_id" = "e"."id")
		+ (SELECT count(*) FROM "session_exercises" WHERE "exercise_id" = "e"."id")
		+ (SELECT count(*) FROM "equipment_exercises" WHERE "exercise_id" = "e"."id")
		+ (SELECT count(*) FROM "progression_suggestions" WHERE "exercise_id" = "e"."id") AS "n"
	FROM "exercises" "e"
), "ranked" AS (
	SELECT "e"."id",
		first_value("e"."id") OVER (
			PARTITION BY lower(trim("e"."name"))
			ORDER BY coalesce("e"."is_default", 0), "r"."n" DESC, "e"."created_at", "e"."id"
		) AS "survivor_id"
	FROM "exercises" "e" JOIN "refs" "r" ON "r"."id" = "e"."id"
)
SELECT "id" AS "loser_id", "survivor_id" FROM "ranked" WHERE "id" <> "survivor_id";--> statement-breakpoint
-- Keep what the survivor lacks: notes, description, and the image (both paths, as a pair).
UPDATE "exercises" "s" SET "notes" = "l"."notes"
FROM (SELECT DISTINCT ON ("m"."survivor_id") "m"."survivor_id", "e"."notes"
	FROM "_exercise_merge" "m" JOIN "exercises" "e" ON "e"."id" = "m"."loser_id"
	WHERE trim(coalesce("e"."notes", '')) <> ''
	ORDER BY "m"."survivor_id", "e"."created_at", "e"."id") "l"
WHERE "s"."id" = "l"."survivor_id" AND trim(coalesce("s"."notes", '')) = '';--> statement-breakpoint
UPDATE "exercises" "s" SET "description" = "l"."description"
FROM (SELECT DISTINCT ON ("m"."survivor_id") "m"."survivor_id", "e"."description"
	FROM "_exercise_merge" "m" JOIN "exercises" "e" ON "e"."id" = "m"."loser_id"
	WHERE trim(coalesce("e"."description", '')) <> ''
	ORDER BY "m"."survivor_id", "e"."created_at", "e"."id") "l"
WHERE "s"."id" = "l"."survivor_id" AND trim(coalesce("s"."description", '')) = '';--> statement-breakpoint
UPDATE "exercises" "s" SET "image_path" = "l"."image_path", "thumb_path" = "l"."thumb_path"
FROM (SELECT DISTINCT ON ("m"."survivor_id") "m"."survivor_id", "e"."image_path", "e"."thumb_path"
	FROM "_exercise_merge" "m" JOIN "exercises" "e" ON "e"."id" = "m"."loser_id"
	WHERE "e"."image_path" IS NOT NULL
	ORDER BY "m"."survivor_id", "e"."created_at", "e"."id") "l"
WHERE "s"."id" = "l"."survivor_id" AND "s"."image_path" IS NULL;--> statement-breakpoint
-- Repoint every reference to the survivor (on prod the merged copies have none; this is defensive).
UPDATE "sets" SET "exercise_id" = "m"."survivor_id" FROM "_exercise_merge" "m" WHERE "sets"."exercise_id" = "m"."loser_id";--> statement-breakpoint
UPDATE "template_exercises" SET "exercise_id" = "m"."survivor_id" FROM "_exercise_merge" "m" WHERE "template_exercises"."exercise_id" = "m"."loser_id";--> statement-breakpoint
UPDATE "session_exercises" SET "exercise_id" = "m"."survivor_id" FROM "_exercise_merge" "m" WHERE "session_exercises"."exercise_id" = "m"."loser_id";--> statement-breakpoint
-- equipment_exercises is keyed (equipment_id, exercise_id): add the survivor link, drop the old one.
INSERT INTO "equipment_exercises" ("equipment_id", "exercise_id")
SELECT DISTINCT "ee"."equipment_id", "m"."survivor_id"
FROM "equipment_exercises" "ee" JOIN "_exercise_merge" "m" ON "ee"."exercise_id" = "m"."loser_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "equipment_exercises" WHERE "exercise_id" IN (SELECT "loser_id" FROM "_exercise_merge");--> statement-breakpoint
-- progression_suggestions is unique per (user_id, exercise_id): keep one Suggestion per User, the
-- survivor's own if it has one, else the newest merged one.
DELETE FROM "progression_suggestions" "p"
USING "_exercise_merge" "m"
WHERE "p"."exercise_id" = "m"."loser_id"
	AND "p"."id" <> (
		SELECT "q"."id" FROM "progression_suggestions" "q"
		WHERE "q"."user_id" = "p"."user_id"
			AND ("q"."exercise_id" = "m"."survivor_id"
				OR "q"."exercise_id" IN (SELECT "loser_id" FROM "_exercise_merge" WHERE "survivor_id" = "m"."survivor_id"))
		ORDER BY ("q"."exercise_id" = "m"."survivor_id") DESC, "q"."created_at" DESC, "q"."id" DESC
		LIMIT 1
	);--> statement-breakpoint
UPDATE "progression_suggestions" SET "exercise_id" = "m"."survivor_id" FROM "_exercise_merge" "m" WHERE "progression_suggestions"."exercise_id" = "m"."loser_id";--> statement-breakpoint
DELETE FROM "exercises" WHERE "id" IN (SELECT "loser_id" FROM "_exercise_merge");--> statement-breakpoint
DROP TABLE "_exercise_merge";--> statement-breakpoint
-- 3. Notes become per-User; existing notes stay with the User who owned the Exercise.
INSERT INTO "user_exercise_notes" ("user_id", "exercise_id", "notes", "updated_at")
SELECT "u"."id", "e"."id", "e"."notes", extract(epoch FROM now())::integer
FROM "exercises" "e" JOIN "users" "u" ON "u"."id" = coalesce("e"."user_id", 'default-user')
WHERE trim(coalesce("e"."notes", '')) <> '';--> statement-breakpoint
-- 4. Schema.
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "archived_at" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_lower_unique" ON "exercises" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "is_default";
