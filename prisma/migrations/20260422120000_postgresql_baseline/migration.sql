-- CreateEnum
CREATE TYPE "ChapterMood" AS ENUM ('calm', 'tension', 'chaos');

-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('narration', 'dialogue', 'system', 'action');

-- CreateEnum
CREATE TYPE "AudioKind" AS ENUM ('ambient', 'sfx_system', 'sfx_action', 'ui_hover', 'voice', 'music');

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "mood" "ChapterMood" NOT NULL DEFAULT 'calm',
    "intensity" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "kind" "SegmentKind" NOT NULL DEFAULT 'narration',
    "text" TEXT NOT NULL,
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManhwaPanel" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ManhwaPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "AudioKind" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chapterSlug" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL DEFAULT 0,
    "scrollRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaderAuthAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "deviceHint" TEXT,

    CONSTRAINT "ReaderAuthAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_slug_key" ON "Chapter"("slug");

-- CreateIndex
CREATE INDEX "Segment_chapterId_orderIndex_idx" ON "Segment"("chapterId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ManhwaPanel_segmentId_key" ON "ManhwaPanel"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioAsset_key_key" ON "AudioAsset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_sessionId_chapterSlug_key" ON "ReadingProgress"("sessionId", "chapterSlug");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_idx" ON "AnalyticsEvent"("event");

-- CreateIndex
CREATE INDEX "ReaderAuthAudit_createdAt_idx" ON "ReaderAuthAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManhwaPanel" ADD CONSTRAINT "ManhwaPanel_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
