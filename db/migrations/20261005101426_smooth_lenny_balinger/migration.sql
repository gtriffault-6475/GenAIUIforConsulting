ALTER TABLE `livrable` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `livrable` ADD `drive_file_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `livrable_project_id_drive_file_id_unique` ON `livrable` (`project_id`,`drive_file_id`) WHERE "livrable"."drive_file_id" is not null;--> statement-breakpoint
-- Story 5.3 backfill (hand-written): a conversation keeps at most one livrable (AD-14). Older duplicates (a pre-Epic-5 demo bug) keep the link only on their first livrable by rowid.
UPDATE `livrable` SET `conversation_id` = NULL WHERE `conversation_id` IS NOT NULL AND rowid NOT IN (SELECT MIN(rowid) FROM `livrable` WHERE `conversation_id` IS NOT NULL GROUP BY `conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `livrable_conversation_id_unique` ON `livrable` (`conversation_id`) WHERE "livrable"."conversation_id" is not null;