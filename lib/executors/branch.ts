import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { evaluateExpression, ExpressionError, isTruthy } from "../engine/expr";

const configSchema = z.object({
  condition: z.string().min(1).default("input.ok").meta({
    control: "code",
    description:
      "Expression over `input`. Truthy takes the True path; the other path's dependents are skipped.",
    placeholder: "input.exitCode === 0",
  }),
});

export type BranchConfig = z.infer<typeof configSchema>;

export const branchExecutor: NodeExecutor<BranchConfig> = {
  kind: "branch",
  label: "Branch",
  description: "Split the graph on a condition.",
  icon: "GitFork",
  accent: "sky",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Input", type: "any" }],
    outputs: [
      { id: "true", label: "True", type: "any" },
      { id: "false", label: "False", type: "any" },
    ],
  },

  async *run(ctx) {
    const input = ctx.inputs.in ?? null;

    try {
      const result = evaluateExpression(ctx.config.condition, input);
      const taken = isTruthy(result) ? "true" : "false";

      yield {
        type: "log",
        stream: "stdout",
        text: `${ctx.config.condition} → ${JSON.stringify(result)} → taking "${taken}"`,
      };

      // Only the taken handle is live; edges off the other one are dead, and
      // the scheduler skips whatever depends solely on them.
      yield {
        type: "succeeded",
        outputs: { [taken]: input },
        taken: [taken],
      };
    } catch (err) {
      const message =
        err instanceof ExpressionError ? err.message : String(err);
      yield { type: "log", stream: "stderr", text: message };
      yield { type: "failed", error: message };
    }
  },
};
