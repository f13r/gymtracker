CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "coaching_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "training_phase" text;