-- Hand-edited: existing points were all added by staff before sign-in existed, so they get
-- source = 'staff' and no creator. The default only fills existing rows; new rows must say.
ALTER TABLE "points" ADD COLUMN "source" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "points" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "points" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "points_created_by_idx" ON "points" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_source_check" CHECK ("points"."source" in ('staff', 'public'));