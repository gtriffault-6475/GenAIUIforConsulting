CREATE TABLE `conversation` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	CONSTRAINT `fk_conversation_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`)
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	CONSTRAINT `fk_message_conversation_id_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project` (
	`id` text PRIMARY KEY,
	`octopod_project_ref` text NOT NULL,
	`name` text NOT NULL,
	`mattermost_channel_ref` text NOT NULL,
	`active_conversation_id` text,
	CONSTRAINT `fk_project_active_conversation_id_conversation_id_fk` FOREIGN KEY (`active_conversation_id`) REFERENCES `conversation`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_project`(`id`, `octopod_project_ref`, `name`, `mattermost_channel_ref`, `active_conversation_id`) SELECT `id`, `octopod_project_ref`, `name`, `mattermost_channel_ref`, `active_conversation_id` FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
PRAGMA foreign_keys=ON;