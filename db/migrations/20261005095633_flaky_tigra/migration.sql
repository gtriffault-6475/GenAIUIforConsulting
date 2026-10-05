ALTER TABLE `document` ADD `drive_file_id` text;--> statement-breakpoint
ALTER TABLE `document` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `document` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `document` ADD `modified_time` text;--> statement-breakpoint
ALTER TABLE `document` ADD `used_as_context` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `document_project_id_drive_file_id_unique` ON `document` (`project_id`,`drive_file_id`) WHERE "document"."drive_file_id" is not null;--> statement-breakpoint
-- Story 5.2 backfill (hand-written): pre-existing drive rows only ever came from the Round 1 mock and use the old id scheme; drop them, the next resync re-creates them with driveFileId/origin. Manual documents are always used as context (FR-4).
DELETE FROM `document` WHERE `source` = 'drive';--> statement-breakpoint
UPDATE `document` SET `used_as_context` = 1 WHERE `source` = 'manual';
