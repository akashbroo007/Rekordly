ALTER TABLE `recordings` ADD `source_recording_id` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `edit_history` text;--> statement-breakpoint
CREATE INDEX `recordings_source_idx` ON `recordings` (`source_recording_id`);