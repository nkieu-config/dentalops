DROP INDEX "patients_tenant_id_phone_email_key";

CREATE UNIQUE INDEX "patients_tenant_id_phone_key" ON "patients"("tenant_id", "phone");
