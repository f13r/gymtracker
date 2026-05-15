ALTER TABLE "sets" DROP CONSTRAINT "sets_equipment_id_equipment_id_fk";
--> statement-breakpoint
ALTER TABLE "template_exercises" DROP CONSTRAINT "template_exercises_equipment_id_equipment_id_fk";
--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_user_id_unique" ON "gyms" USING btree ("user_id");