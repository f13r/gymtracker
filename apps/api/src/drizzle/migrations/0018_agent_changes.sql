-- Audit trail of the Agent's applied documents: the document as sent and the diff as applied.
CREATE TABLE "agent_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" integer NOT NULL,
	"target_user_id" text,
	"document" jsonb NOT NULL,
	"diff" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_changes" ADD CONSTRAINT "agent_changes_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;