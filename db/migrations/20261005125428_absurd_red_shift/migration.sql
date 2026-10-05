CREATE TABLE `presentation_proposal` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`title` text NOT NULL,
	`slides` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`livrable_id` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_presentation_proposal_conversation_id_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`),
	CONSTRAINT `fk_presentation_proposal_message_id_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`),
	CONSTRAINT `fk_presentation_proposal_livrable_id_livrable_id_fk` FOREIGN KEY (`livrable_id`) REFERENCES `livrable`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presentation_proposal_message_id_unique` ON `presentation_proposal` (`message_id`);