CREATE TABLE `google_connection` (
	`id` text PRIMARY KEY,
	`refresh_token` text NOT NULL,
	`account_email` text NOT NULL,
	`connected_at` text NOT NULL
);
