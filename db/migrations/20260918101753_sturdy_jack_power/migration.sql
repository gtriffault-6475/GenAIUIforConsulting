CREATE TABLE `suggestion` (
	`id` text PRIMARY KEY,
	`livrable_id` text NOT NULL,
	`type` text NOT NULL,
	`anchor_ref` text,
	`text` text NOT NULL,
	`status` text NOT NULL,
	CONSTRAINT `fk_suggestion_livrable_id_livrable_id_fk` FOREIGN KEY (`livrable_id`) REFERENCES `livrable`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_livrable_id_anchor_ref_pending_anchored_unique` ON `suggestion` (`livrable_id`,`anchor_ref`) WHERE "suggestion"."status" = 'pending' and "suggestion"."type" = 'anchored';