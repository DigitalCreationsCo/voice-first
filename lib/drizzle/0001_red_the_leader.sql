CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"word" text NOT NULL,
	"english" text NOT NULL,
	"phonetic" text NOT NULL,
	"audio_url" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_language_word_idx" ON "translations" USING btree ("user_id","language","word");--> statement-breakpoint
CREATE INDEX "user_language_idx" ON "translations" USING btree ("user_id","language");--> statement-breakpoint
CREATE INDEX "usage_count_idx" ON "translations" USING btree ("user_id","language","usage_count");