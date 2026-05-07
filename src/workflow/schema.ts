import { z } from "zod";

const commandString = z
  .string()
  .min(1, "Command cannot be empty")
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Command cannot be whitespace only")
  .refine((s) => !s.includes("\0"), "Command contains invalid null byte");

const whenCondition = z
  .string()
  .refine(
    (value) =>
      value === "linux" ||
      value === "macos" ||
      value === "windows" ||
      value.startsWith("command-exists:") ||
      value.startsWith("env:") ||
      value.startsWith("file-exists:"),
    "Invalid when condition",
  );

export const workflowStepSchema = z.object({
  id: z.string().min(1, "Step id is required"),
  description: z.string().min(1, "Step description is required"),
  run: commandString,
  check: commandString.optional(),
  type: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
  group: z.string().min(1).optional(),
  retry: z.number().int().min(0).optional(),
  timeout: z.number().int().min(1).optional(),
  when: whenCondition.optional(),
});

export const workflowDefinitionSchema = z
  .object({
    name: z.string().min(1, "Workflow name is required"),
    version: z.string().min(1, "Workflow version is required"),
    description: z.string().min(1, "Workflow description is required"),
    variables: z.record(z.string()).optional(),
    steps: z.array(workflowStepSchema).min(1, "At least one step is required"),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.steps.length; i += 1) {
      const id = data.steps[i].id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step id: "${id}"`,
          path: ["steps", i, "id"],
        });
      }
      seen.add(id);
    }
  });

export type WorkflowDefinitionParsed = z.infer<typeof workflowDefinitionSchema>;
