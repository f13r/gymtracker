-- A Template's name is unique per User, ignoring case: the Agent addresses Templates by name
-- (POST /api/agent/apply). Prod had no duplicates when this was written; on a database that has
-- some, this fails and the duplicates must be renamed first.
CREATE UNIQUE INDEX "workout_templates_user_name_lower_unique" ON "workout_templates" USING btree ("user_id",lower("name"));