-- Users get a sign-in email; the users table is the allowlist (no admin UI: add Users by SQL).
-- Emails are personal data and the repo is public, so none is written here: the API sets them at
-- boot from the HOUSEHOLD_EMAILS env var (apps/api/src/seed/household-emails.ts).
-- Hand-edited after the drizzle-kit output (ADD COLUMN + UNIQUE): also ensure the household's two
-- Users exist. On an existing install default-user is already there; on a fresh install (the API
-- seed creates no User) both rows are created. Existing rows are left as they are.
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
INSERT INTO "users" ("id", "display_name", "created_at") VALUES
	('default-user', 'Viktor', extract(epoch FROM now())::integer),
	('inna', 'Inna', extract(epoch FROM now())::integer)
ON CONFLICT ("id") DO NOTHING;
