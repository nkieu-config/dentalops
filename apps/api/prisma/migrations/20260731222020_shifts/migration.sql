-- CreateEnum
CREATE TYPE "RecurrenceFreq" AS ENUM ('weekly', 'monthly_date');

-- CreateTable
CREATE TABLE "shift_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "freq" "RecurrenceFreq" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "by_weekday" INTEGER[],
    "time_start" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shift_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "series_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "detached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID,
    "branch_id" UUID,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_series_tenant_id_staff_id_idx" ON "shift_series"("tenant_id", "staff_id");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_branch_id_starts_at_idx" ON "shifts"("tenant_id", "branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_staff_id_starts_at_idx" ON "shifts"("tenant_id", "staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "time_blocks_tenant_id_staff_id_starts_at_idx" ON "time_blocks"("tenant_id", "staff_id", "starts_at");

-- AddForeignKey
ALTER TABLE "shift_series" ADD CONSTRAINT "shift_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "shift_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "shifts"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "time_blocks"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- A staff member cannot hold two overlapping shifts, in any branch.
ALTER TABLE "shifts"
  ADD CONSTRAINT "no_staff_double_shift"
  EXCLUDE USING GIST ("staff_id" WITH =, "during" WITH &&);

CREATE INDEX "shifts_during_idx" ON "shifts" USING GIST ("during");
CREATE INDEX "time_blocks_during_idx" ON "time_blocks" USING GIST ("during");
