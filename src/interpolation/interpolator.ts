export interface InterpolationContext {
  readonly variables: Record<string, string>;
}

const variablePattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function interpolateString(template: string, ctx: InterpolationContext): string {
  if (!template.includes("{{")) {
    return template;
  }
  return template.replace(variablePattern, (_, rawName: string) => {
    const key = rawName.trim();
    const value = ctx.variables[key];
    return value ?? "";
  });
}

export function interpolateRecord(
  input: Record<string, string> | undefined,
  ctx: InterpolationContext,
): Record<string, string> | undefined {
  if (!input) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = interpolateString(v, ctx);
  }
  return out;
}

