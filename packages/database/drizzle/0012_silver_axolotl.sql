-- ponytail: per-creator stats read 0 because completed Library rows were
-- created with creator_id = NULL even though their recording_jobs row knew
-- the creator. Backfill every Library entry from its job, then leave jobs
-- with no known creator (adopted/legacy manual streams) untouched.
UPDATE `recordings`
SET `creator_id` = (SELECT `creator_id` FROM `recording_jobs` WHERE `recording_jobs`.`id` = `recordings`.`job_id`)
WHERE `recordings`.`creator_id` IS NULL
  AND `recordings`.`job_id` IS NOT NULL
  AND (SELECT `creator_id` FROM `recording_jobs` WHERE `recording_jobs`.`id` = `recordings`.`job_id`) IS NOT NULL
  AND (SELECT `creator_id` FROM `recording_jobs` WHERE `recording_jobs`.`id` = `recordings`.`job_id`) != ''
