-- AlterTable
ALTER TABLE "events" ADD COLUMN     "confidence" INTEGER DEFAULT 100,
ADD COLUMN     "discovery_source_url" TEXT;

-- DropTable
DROP TABLE "watched_artists";

-- CreateTable
CREATE TABLE "discovery_queries" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discovery_queries_query_key" ON "discovery_queries"("query");

