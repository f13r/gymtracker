ALTER TABLE "exercises" ADD COLUMN "wger_id" integer;
--> statement-breakpoint
-- Backfill wger.de exercise ids for the seeded default library (the seeder only runs on an empty DB).
UPDATE "exercises" SET "wger_id" = CASE "name"
  WHEN 'Bench Press' THEN 73
  WHEN 'Squat' THEN 1801
  WHEN 'Deadlift' THEN 184
  WHEN 'Overhead Press' THEN 1893
  WHEN 'Barbell Row' THEN 83
  WHEN 'Romanian Deadlift' THEN 1652
  WHEN 'Front Squat' THEN 1640
  WHEN 'Incline Bench Press' THEN 538
  WHEN 'Dumbbell Press' THEN 1277
  WHEN 'Dumbbell Row' THEN 81
  WHEN 'Lateral Raise' THEN 348
  WHEN 'Bicep Curl' THEN 92
  WHEN 'Tricep Extension' THEN 1336
  WHEN 'Dumbbell Lunge' THEN 1651
  WHEN 'Bulgarian Split Squat' THEN 1706
  WHEN 'Leg Press' THEN 371
  WHEN 'Leg Curl' THEN 364
  WHEN 'Leg Extension' THEN 851
  WHEN 'Cable Row' THEN 1117
  WHEN 'Lat Pulldown' THEN 158
  WHEN 'Chest Fly' THEN 926
  WHEN 'Cable Lateral Raise' THEN 1378
  WHEN 'Pull-up' THEN 475
  WHEN 'Chin-up' THEN 154
  WHEN 'Push-up' THEN 1551
  WHEN 'Dip' THEN 194
  WHEN 'Plank' THEN 458
  WHEN 'Hollow Hold' THEN 297
  ELSE "wger_id"
END
WHERE "is_default" = 1;
