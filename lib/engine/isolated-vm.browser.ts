// Browser stand-in for the server-only isolated-vm native addon, wired via
// turbopack.resolveAlias in next.config.ts. getIvm() only runs on the server,
// so this module is bundled into the client graph but never executed there.
export {};