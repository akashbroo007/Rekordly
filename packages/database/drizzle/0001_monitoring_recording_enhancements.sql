CREATE TABLE `monitoring_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`interval_ms` integer DEFAULT 300000 NOT NULL,
	`next_check_at` integer NOT NULL,
	`last_check_at` integer,
	`last_result` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitoring_jobs_creator_idx` ON `monitoring_jobs` (`creator_id`);--> statement-breakpoint
CREATE INDEX `monitoring_jobs_state_idx` ON `monitoring_jobs` (`state`);--> statement-breakpoint
CREATE INDEX `monitoring_jobs_next_check_idx` ON `monitoring_jobs` (`next_check_at`);--> statement-breakpoint
CREATE INDEX `monitoring_jobs_plugin_idx` ON `monitoring_jobs` (`plugin_id`);--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `platform_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `thumbnail` text;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `quality` text;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `max_attempts` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `bytes_downloaded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `speed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `eta` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `percent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `file_path` text;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `thumbnail_path` text;--> statement-breakpoint
ALTER TABLE `recording_jobs` ADD `verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recordings` ADD `video_codec` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `audio_codec` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `bitrate` integer;--> statement-breakpoint
ALTER TABLE `recordings` ADD `fps` integer;