CREATE TABLE IF NOT EXISTS "entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"source" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"auto_renewing" boolean DEFAULT false NOT NULL,
	"telegram_payment_charge_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_payload" text NOT NULL,
	"plan" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XTR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"telegram_user_id" bigint NOT NULL,
	"telegram_payment_charge_id" text NOT NULL,
	"provider_payment_charge_id" text,
	"invoice_payload" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"is_first_recurring" boolean DEFAULT false NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_invoice_payload_unique" ON "payment_orders" USING btree ("invoice_payload");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_telegram_charge_unique" ON "payments" USING btree ("telegram_payment_charge_id");