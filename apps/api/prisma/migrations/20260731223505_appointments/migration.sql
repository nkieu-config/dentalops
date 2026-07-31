-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('confirmed', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('active', 'released');

-- CreateTable
CREATE TABLE "appointment_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "freq" "RecurrenceFreq" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "by_weekday" INTEGER[],
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "series_id" UUID,
    "service_id" UUID NOT NULL,
    "dentist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',
    "version" INTEGER NOT NULL DEFAULT 0,
    "detached" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "resource_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_idx" ON "appointment_series"("tenant_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_branch_id_starts_at_idx" ON "appointments"("tenant_id", "branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_dentist_id_starts_at_idx" ON "appointments"("tenant_id", "dentist_id", "starts_at");

-- CreateIndex
CREATE INDEX "resource_claims_tenant_id_resource_id_starts_at_idx" ON "resource_claims"("tenant_id", "resource_id", "starts_at");

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "appointment_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "resource_claims"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- A dentist cannot hold two overlapping confirmed appointments.
-- Cancelled and no-show rows are excluded so a freed slot is immediately rebookable.
ALTER TABLE "appointments"
  ADD CONSTRAINT "no_dentist_overlap"
  EXCLUDE USING GIST ("dentist_id" WITH =, "during" WITH &&)
  WHERE ("status" = 'confirmed');

-- A physical resource cannot be claimed twice at once.
ALTER TABLE "resource_claims"
  ADD CONSTRAINT "no_resource_overlap"
  EXCLUDE USING GIST ("resource_id" WITH =, "during" WITH &&)
  WHERE ("status" = 'active');

CREATE INDEX "appointments_during_idx" ON "appointments" USING GIST ("during");
CREATE INDEX "resource_claims_during_idx" ON "resource_claims" USING GIST ("during");
