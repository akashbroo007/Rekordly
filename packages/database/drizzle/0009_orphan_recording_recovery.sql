-- ponytail: persist the OS pid of the yt-dlp/ffmpeg child for active
-- recording jobs so orphaned recordings (app closed while recording) can
-- be re-adopted on the next launch (autonomous recorder).
ALTER TABLE `recording_jobs` ADD COLUMN `pid` INTEGER;
