-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "displayPath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "goalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "sessionRef" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "activeMinutes" INTEGER NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "gitBranch" TEXT,
    "label" TEXT,
    "harvestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HarvestState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "lastHarvestedAt" DATETIME,
    "filesSeen" INTEGER NOT NULL DEFAULT 0,
    "filesSkipped" INTEGER NOT NULL DEFAULT 0,
    "activities" INTEGER NOT NULL DEFAULT 0,
    "unattributed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HarvestState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_userId_status_idx" ON "Project"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_path_key" ON "Project"("userId", "path");

-- CreateIndex
CREATE INDEX "Activity_userId_startedAt_idx" ON "Activity"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Activity_projectId_idx" ON "Activity"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_userId_tool_sessionRef_key" ON "Activity"("userId", "tool", "sessionRef");

-- CreateIndex
CREATE UNIQUE INDEX "HarvestState_userId_tool_key" ON "HarvestState"("userId", "tool");
