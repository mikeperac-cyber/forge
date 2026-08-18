import { claudeCodeHarvester, createClaudeCodeHarvester } from "./claude-code";
import { codexHarvester, createCodexHarvester } from "./codex";
import { createGeminiHarvester, geminiHarvester } from "./gemini";
import type { ToolHarvester } from "./types";

/**
 * Every tool Forge knows how to read.
 *
 * Deliberately the same shape as `lib/engine/registry.ts`: one file per
 * implementation, one line here. Adding a tool should never require touching
 * the orchestrator, the action, the script or the UI — they all iterate this.
 *
 * Order is display order. A harvester whose source isn't on this machine
 * reports `detected: false` and costs nothing, so listing a tool you don't use
 * is harmless.
 */
export const HARVESTERS: ToolHarvester[] = [
  claudeCodeHarvester,
  codexHarvester,
  geminiHarvester,
];

export function findHarvester(id: string): ToolHarvester | undefined {
  return HARVESTERS.find((h) => h.id === id);
}

/**
 * The same tools, but with the idle threshold left open.
 *
 * `ToolHarvester` deliberately doesn't expose the gap — it's a detail of the
 * implementations that have one, not part of the contract — so calibration
 * reaches for the constructors instead. Kept beside the registry so a new tool
 * is added in one place rather than two.
 */
export const HARVESTER_FACTORIES: Record<string, (gap: number) => ToolHarvester> = {
  "claude-code": (gap) => createClaudeCodeHarvester(undefined, gap),
  codex: (gap) => createCodexHarvester(undefined, gap),
  gemini: (gap) => createGeminiHarvester(undefined, gap),
};
