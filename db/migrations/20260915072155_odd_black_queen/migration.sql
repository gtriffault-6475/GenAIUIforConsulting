CREATE TABLE `document` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`folder_path` text,
	`content` text NOT NULL,
	CONSTRAINT `fk_document_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`)
);
