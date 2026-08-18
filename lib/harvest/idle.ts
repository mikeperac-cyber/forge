/**
 * How long a pause has to be before it stops counting as work.
 *
 * Every harvester applies the same rule: consecutive timestamps closer together
 * than this are one continuous stretch; anything longer is treated as
 * away-from-desk and contributes nothing. Without it a transcript left open
 * overnight claims the whole night — on this machine one session spans 50h28m
 * of wall clock around 1h09m of actual work.
 *
 * The constant lives here rather than inside any one tool because all three
 * share it, and a threshold that differed per tool would make their numbers
 * incomparable.
 *
 * ## Re-deriving it
 *
 * `npm run harvest:calibrate` sweeps the threshold across the raw transcripts
 * and prints how much time sits in each band of gap length. A good threshold
 * sits in a *valley* — a range where almost no gaps occur — because that is
 * where the boundary between "thinking" and "gone" actually falls, rather than
 * cutting through a cluster of real pauses.
 *
 * Re-run it as history accumulates. The original 15 was calibrated against a
 * dataset that Claude Code has since aged out, which is exactly the failure
 * mode this script exists to prevent.
 *
 * ## Why 15, as of 2026-08-16
 *
 * Re-derived across Claude Code, Codex and Gemini — 14h of inter-message time,
 * none of it the data the original 15 came from:
 *
 *     0–1m    4h 16m   ██████████████████████████████████
 *     1–15m   6h 37m   spread fairly evenly, 12–41m per band
 *     15–20m       0m
 *     20–40m  1h 50m
 *     40–60m       0m
 *     60–90m  1h 16m
 *
 * 15 sits at the near edge of an empty 15–20m band, so anything from 15 to 20
 * yields the same 10h53m — it is stable, and will not swing on a few minutes'
 * drift. The band immediately below carries 41m, so dropping under 15 starts
 * discarding real pauses.
 *
 * The next genuine boundary is 40–60m, also empty, worth 1h50m more. It was
 * rejected on judgement rather than arithmetic: a 40-minute silence is lunch,
 * not someone thinking. That is the one part of this number that is a choice
 * rather than a measurement, and it is written down here so it can be argued
 * with.
 *
 * 78% of all inter-message time falls inside the threshold.
 */
export const DEFAULT_IDLE_GAP_MINUTES = 15;
