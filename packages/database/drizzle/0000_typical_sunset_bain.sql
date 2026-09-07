CREATE TABLE `collection_recordings` (
	`collection_id` text NOT NULL,
	`recording_id` text NOT NULL,
	PRIMARY KEY(`collection_id`, `recording_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_recordings_recording_idx` ON `collection_recordings` (`recording_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_name_idx` ON `collections` (`name`);--> statement-breakpoint
CREATE TABLE `creator_tags` (
	`creator_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`creator_id`, `tag_id`),
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creator_tags_tag_idx` ON `creator_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`external_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`profile_url` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	`notes` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_plugin_external_idx` ON `creators` (`plugin_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `creators_username_idx` ON `creators` (`username`);--> statement-breakpoint
CREATE INDEX `creators_display_name_idx` ON `creators` (`display_name`);--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time` integer NOT NULL,
	`level` text NOT NULL,
	`scope` text NOT NULL,
	`message` text NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `logs_time_idx` ON `logs` (`time`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time` integer NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `notifications_read_time_idx` ON `notifications` (`read`,`time`);--> statement-breakpoint
CREATE TABLE `plugin_data` (
	`plugin_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`plugin_id`, `key`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_settings` (
	`plugin_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`plugin_id`, `key`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest` text NOT NULL,
	`entry` text NOT NULL,
	`install_path` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`permissions_granted` text DEFAULT '[]' NOT NULL,
	`installed_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugins_name_idx` ON `plugins` (`name`);--> statement-breakpoint
CREATE TABLE `recording_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text,
	`plugin_id` text NOT NULL,
	`stream_url` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recording_jobs_status_idx` ON `recording_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `recording_jobs_creator_idx` ON `recording_jobs` (`creator_id`);--> statement-breakpoint
CREATE INDEX `recording_jobs_created_idx` ON `recording_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text,
	`job_id` text,
	`title` text NOT NULL,
	`platform_id` text NOT NULL,
	`file_name` text,
	`file_path` text,
	`thumbnail_path` text,
	`status` text NOT NULL,
	`quality` text,
	`resolution` text,
	`size_bytes` integer,
	`duration_seconds` integer,
	`notes` text,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `recording_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recordings_creator_idx` ON `recordings` (`creator_id`);--> statement-breakpoint
CREATE INDEX `recordings_status_idx` ON `recordings` (`status`);--> statement-breakpoint
CREATE INDEX `recordings_platform_idx` ON `recordings` (`platform_id`);--> statement-breakpoint
CREATE INDEX `recordings_started_idx` ON `recordings` (`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_updated_at_idx` ON `settings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);