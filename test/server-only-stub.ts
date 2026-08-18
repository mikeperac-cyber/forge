/**
 * `server-only` throws unless resolved under the `react-server` condition,
 * which vitest doesn't use. Tests run server code directly in Node, so the
 * guard is meaningless there — this stub stands in for it.
 */
export {};
