CREATE TABLE `app_state` (
	`id` text PRIMARY KEY,
	`active_project_id` text,
	CONSTRAINT `fk_app_state_active_project_id_project_id_fk` FOREIGN KEY (`active_project_id`) REFERENCES `project`(`id`)
);
--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY,
	`octopod_project_ref` text NOT NULL,
	`name` text NOT NULL,
	`mattermost_channel_ref` text NOT NULL,
	`active_conversation_id` text
);
