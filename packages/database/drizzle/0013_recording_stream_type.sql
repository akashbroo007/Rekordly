-- ponytail: VR-capable plugins (Dreamcam) tag recordings with their stream
-- variant ('vr' / '2d'); the player reads the Library column to auto-enable
-- projection/stereo controls, and the job column keeps re-extractions
-- (resume, segment chaining) on the SAME variant the user picked. Both null
-- = plain 2D capture (every pre-existing row).
ALTER TABLE `recordings` ADD COLUMN `stream_type` text;
ALTER TABLE `recording_jobs` ADD COLUMN `stream_type` text;