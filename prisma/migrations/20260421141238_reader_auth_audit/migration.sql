-- CreateTable
CREATE TABLE "ReaderAuthAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "deviceHint" TEXT
);

-- CreateIndex
CREATE INDEX "ReaderAuthAudit_createdAt_idx" ON "ReaderAuthAudit"("createdAt");
