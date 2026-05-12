CREATE TABLE `workout_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text REFERENCES users(`id`),
	`template_id` text REFERENCES workout_templates(`id`),
	`type` text NOT NULL,
	`scheduled_date` text,
	`day_of_week` integer,
	`created_at` integer NOT NULL
);
