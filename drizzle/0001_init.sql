-- Edited by hand: drizzle-kit 0.31 drops the SRID, so "location" was changed to geometry(point, 4326).
CREATE TABLE "chapter_points" (
	"chapter_id" text NOT NULL,
	"point_id" text NOT NULL,
	"position" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "chapter_points_chapter_id_point_id_pk" PRIMARY KEY("chapter_id","point_id")
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"narrative" text DEFAULT '' NOT NULL,
	"connection" text NOT NULL,
	"route" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"camera" jsonb,
	CONSTRAINT "chapters_connection_check" CHECK ("chapters"."connection" in ('timeline', 'path'))
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"location" geometry(point, 4326) NOT NULL,
	"location_precision" text NOT NULL,
	"location_radius_m" double precision,
	"place_name" text DEFAULT '' NOT NULL,
	"captured_at" timestamp(0),
	"time_precision" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"contributor" text DEFAULT '' NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "points_kind_check" CHECK ("points"."kind" in ('photo', 'video', 'audio', 'note')),
	CONSTRAINT "points_location_precision_check" CHECK ("points"."location_precision" in ('exact', 'approximate', 'obscured')),
	CONSTRAINT "points_time_precision_check" CHECK ("points"."time_precision" in ('exact', 'approximate'))
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "stories_status_check" CHECK ("stories"."status" in ('draft', 'published'))
);
--> statement-breakpoint
ALTER TABLE "chapter_points" ADD CONSTRAINT "chapter_points_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_points" ADD CONSTRAINT "chapter_points_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_points_point_id_idx" ON "chapter_points" USING btree ("point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_story_position_idx" ON "chapters" USING btree ("story_id","position");--> statement-breakpoint
CREATE INDEX "collections_updated_at_idx" ON "collections" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "points_location_idx" ON "points" USING gist ("location");--> statement-breakpoint
CREATE INDEX "points_search_text_idx" ON "points" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "points_updated_at_idx" ON "points" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_collection_id_idx" ON "stories" USING btree ("collection_id");
