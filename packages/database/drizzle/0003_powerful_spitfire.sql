ALTER TABLE `download_queue` ADD `engine` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `download_queue` ADD `file_path` text;