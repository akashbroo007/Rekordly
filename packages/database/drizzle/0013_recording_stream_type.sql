-- ponytail: VR-capable plugins (Dreamcam) tag recordings with their stream
-- variant ('vr' / '2d'); the player reads the Library column to auto-enable
-- projection/stereo controls, and the job column keeps re-extractions
-- (resume, segment chaining) on the SAME variant the user picked. Both null
-- = plain 2D capture (every pre-existing row).
--
-- NOTE: drizzle splits a migration file on its statement-breakpoint marker and
-- hands each piece to better-sqlite3 as ONE statement ("The supplied SQL string
-- contains more than one statement"). This file originally had no marker, so
-- both ALTERs were passed through as a single statement: every fresh database
-- failed its first launch here, drizzle rolled the ENTIRE chain back (one
-- BEGIN/COMMIT per run), and the app died on "Rekordly failed to start" before
-- the logger existed. Never write the marker text inside a comment either —
-- that creates an empty chunk. Keep one statement per chunk.
ALTER TABLE `recordings` ADD COLUMN `stream_type` text;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD COLUMN `stream_type` text;
