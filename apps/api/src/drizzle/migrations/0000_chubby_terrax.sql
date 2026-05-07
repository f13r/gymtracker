CREATE TABLE `body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`recorded_at` integer NOT NULL,
	`chest` real,
	`waist` real,
	`hips` real,
	`left_bicep` real,
	`right_bicep` real,
	`left_thigh` real,
	`right_thigh` real,
	`shoulders` real,
	`neck` real,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `body_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`weight_kg` real NOT NULL,
	`recorded_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`category` text,
	`equipment` text,
	`notes` text,
	`is_default` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`recorded_at` integer NOT NULL,
	`file_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`body_weight` real,
	`tags` text,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`exercise_id` text,
	`set_number` integer NOT NULL,
	`reps` integer,
	`weight_kg` real,
	`duration_sec` integer,
	`rpe` real,
	`is_warmup` integer DEFAULT 0,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text,
	`exercise_id` text,
	`order_index` integer NOT NULL,
	`default_sets` integer,
	`default_reps` integer,
	`default_weight_kg` real,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`template_id` text,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
