CREATE TABLE `project_skill` (
	`project_id` text NOT NULL,
	`skill_key` text NOT NULL,
	CONSTRAINT `fk_project_skill_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`),
	CONSTRAINT `project_skill_project_id_skill_key_unique` UNIQUE(`project_id`,`skill_key`)
);
