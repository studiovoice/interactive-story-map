-- Extensions the tables need. Runs before the first table migration.
-- postgis: geometry columns and spatial indexes. pg_trgm: fast ILIKE '%q%' search.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
