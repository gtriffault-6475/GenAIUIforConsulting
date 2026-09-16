CREATE TABLE `livrable` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`conversation_id` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	CONSTRAINT `fk_livrable_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`),
	CONSTRAINT `fk_livrable_conversation_id_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`)
);
