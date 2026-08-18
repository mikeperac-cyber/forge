/**
 * One work session, as recorded by whichever AI tool produced it.
 *
 * `sessionRef` is the tool's own id for the session. Together with `tool` it is
 * the idempotency key — harvesting twice upserts the same row rather than
 * duplicating the day's work.
 */
export interface RawActivity {
  tool: string;
  sessionRef: string;
  /**
   * Absolute path, canonicalised by the harvester before it leaves. This is the
   * identity key — two spellings of one folder must collapse to a single
   * project.
   */
  path: string;
  /**
   * The same path with its original casing intact, for display.
   *
   * Canonicalisation lowercases on Windows, and that is not recoverable
   * afterwards — so both forms have to leave the harvester together or the
   * cased one is lost for good.
   */
  displayPath: string;
  startedAt: Date;
  endedAt: Date;
  /**
   * Time with the gaps taken out.
   *
   * First-to-last is not work: on this machine one real session spans 34 hours
   * because it was left open overnight. Consecutive messages closer together
   * than the idle threshold count; anything longer is treated as away-from-desk.
   */
  activeMinutes: number;
  messageCount: number;
  gitBranch?: string;
  /** Short human label — a session title, or the opening prompt, truncated. */
  label?: string;
}

export interface HarvestSummary {
  tool: string;
  filesSeen: number;
  filesSkipped: number;
  activities: number;
  /** Files that parsed but carried no usable path, so nothing to attribute to. */
  unattributed: number;
}

/**
 * One file per tool, one line in the registry — the same shape as
 * `NodeExecutor` in `lib/engine/types.ts`, which has held up well.
 *
 * Every implementation must be strictly read-only. Nothing here may write to,
 * move, or touch a file outside the app's own database.
 */
export interface ToolHarvester {
  id: string;
  label: string;
  /** Where this tool keeps its history, for display and diagnostics. */
  describeSource(): string;
  /** Is the tool present on this machine? */
  detect(): Promise<boolean>;
  /**
   * Streams activity. `since` is the previous harvest time — implementations
   * should skip files whose mtime predates it, which is what keeps repeated
   * harvests cheap as transcripts accumulate.
   */
  harvest(
    since: Date | null,
    summary: HarvestSummary,
  ): AsyncIterable<RawActivity>;
}
