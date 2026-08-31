CREATE TABLE "search_query_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"result_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_query_log" ADD CONSTRAINT "search_query_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_query_log" ADD CONSTRAINT "search_query_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_query_log_created_idx" ON "search_query_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_query_log_workspace_idx" ON "search_query_log" USING btree ("workspace_id");