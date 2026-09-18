export interface SelectableTool {
  name: string;
  scope: string;
}

export interface SelectionOptions {
  yes?: boolean;
  include?: string;
  excludeDestructive?: boolean;
}

function countSelectionModes(options: SelectionOptions): number {
  return [options.yes, Boolean(options.include), options.excludeDestructive].filter(Boolean).length;
}

export function resolveNonInteractiveSelection(
  candidates: SelectableTool[],
  options: SelectionOptions
): string[] | undefined {
  if (countSelectionModes(options) > 1) {
    throw new Error("Use only one of --yes, --include, or --exclude-destructive.");
  }
  if (options.include) {
    const wanted = options.include.split(",").map((value) => value.trim()).filter(Boolean);
    const known = new Set(candidates.map((tool) => tool.name));
    const unknown = wanted.filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`Unknown tool name(s) in --include: ${unknown.join(", ")}. Available: ${candidates.map((tool) => tool.name).join(", ")}`);
    }
    return candidates.map((tool) => tool.name).filter((name) => wanted.includes(name));
  }
  if (options.excludeDestructive) {
    return candidates.filter((tool) => tool.scope !== "destructive").map((tool) => tool.name);
  }
  if (options.yes) return candidates.map((tool) => tool.name);
  return undefined;
}
