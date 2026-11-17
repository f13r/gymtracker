-- One household Gym shared by every User. Hand-edited around the drizzle-kit output so existing
-- Equipment is moved into the household Gym before the per-User Gyms go:
--   1. create the household Gym (fixed id, so re-running is a no-op)
--   2. point every Equipment row at it, then delete every other Gym
--   3. drop gyms.user_id and its unique index
-- Equipment photo files stay where they are: they are served through the path stored on the row.
INSERT INTO "gyms" ("id", "name", "created_at")
VALUES ('household', 'My Gym', extract(epoch FROM now())::integer)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "equipment" SET "gym_id" = 'household' WHERE "gym_id" IS DISTINCT FROM 'household';--> statement-breakpoint
DELETE FROM "gyms" WHERE "id" <> 'household';--> statement-breakpoint
ALTER TABLE "gyms" DROP CONSTRAINT "gyms_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "gyms_user_id_unique";--> statement-breakpoint
ALTER TABLE "gyms" DROP COLUMN "user_id";
