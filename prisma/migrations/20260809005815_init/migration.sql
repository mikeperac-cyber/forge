-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "graph" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "Run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "NodeRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "nodeRunId" TEXT,
    "seq" INTEGER NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stream" TEXT NOT NULL DEFAULT 'stdout',
    "text" TEXT NOT NULL,
    CONSTRAINT "LogLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LogLine_nodeRunId_fkey" FOREIGN KEY ("nodeRunId") REFERENCES "NodeRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Workflow_userId_archivedAt_idx" ON "Workflow"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_userId_slug_key" ON "Workflow"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");

-- CreateIndex
CREATE INDEX "Run_workflowId_startedAt_idx" ON "Run"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "NodeRun_runId_idx" ON "NodeRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRun_runId_nodeId_attempt_key" ON "NodeRun"("runId", "nodeId", "attempt");

-- CreateIndex
CREATE INDEX "LogLine_nodeRunId_idx" ON "LogLine"("nodeRunId");

-- CreateIndex
CREATE UNIQUE INDEX "LogLine_runId_seq_key" ON "LogLine"("runId", "seq");
