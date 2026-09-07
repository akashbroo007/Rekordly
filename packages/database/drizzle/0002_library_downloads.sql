ALTER TABLE `recordings` ADD `is_favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `recordings_favorite_idx` ON `recordings` (`is_favorite`);--> statement-breakpoint
CREATE TABLE `recording_tags` (
	`recording_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recording_id`, `tag_id`),
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recording_tags_tag_idx` ON `recording_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `download_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`destination` text NOT NULL,
	`file_name` text NOT NULL,
	`title` text,
	`plugin_id` text,
	`creator_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`bytes_downloaded` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`speed` integer DEFAULT 0 NOT NULL,
	`eta` integer DEFAULT 0 NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `download_queue_status_idx` ON `download_queue` (`status`);--> statement-breakpoint
CREATE INDEX `download_queue_priority_idx` ON `download_queue` (`priority`);--> statement-breakpoint
CREATE INDEX `download_queue_created_idx` ON `download_queue` (`created_at`);--> statement-breakpoint
CREATE TABLE `upload_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text,
	`provider_id` text NOT NULL,
	`source_path` text NOT NULL,
	`destination_path` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`bytes_uploaded` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`speed` integer DEFAULT 0 NOT NULL,
	`eta` integer DEFAULT 0 NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`error` text,
	`checksum` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `upload_queue_status_idx` ON `upload_queue` (`status`);--> statement-breakpoint
CREATE INDEX `upload_queue_provider_idx` ON `upload_queue` (`provider_id`);--> statement-breakpoint
CREATE INDEX `upload_queue_created_idx` ON `upload_queue` (`created_at`);--> statement-breakpoint
CREATE TABLE `background_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`result` text,
	`error` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `background_jobs_type_idx` ON `background_jobs` (`type`);--> statement-breakpoint
CREATE INDEX `background_jobs_status_idx` ON `background_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `background_jobs_created_idx` ON `background_jobs` (`created_at`);
