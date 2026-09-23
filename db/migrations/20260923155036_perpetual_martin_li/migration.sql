ALTER TABLE `project_skill` ADD `position` integer;
--> statement-breakpoint
UPDATE `project_skill` SET `position` = (SELECT COUNT(*) FROM `project_skill` AS t2 WHERE t2.project_id = project_skill.project_id AND t2.rowid <= project_skill.rowid) - 1;