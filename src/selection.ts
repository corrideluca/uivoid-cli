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

export function assertSingleSelectionMode(options: SelectionOptions): void {
  if (countSelectionModes(options) > 1) {
    throw new Error("Use only one of --yes, --include, or --exclude-destructive.");
  }
}

export function resolveNonInteractiveSelection(
  candidates: SelectableTool[],
  options: SelectionOptions
): string[] | undefined {
  assertSingleSelectionMode(options);
  let result: string[] | undefined;
  if (options.include) {
    const wanted = options.include.split(",").map((value) => value.trim()).filter(Boolean);
    const known = new Set(candidates.map((tool) => tool.name));
    const unknown = wanted.filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`Unknown tool name(s) in --include: ${unknown.join(", ")}. Available: ${candidates.map((tool) => tool.name).join(", ")}`);
    }
    result = candidates.map((tool) => tool.name).filter((name) => wanted.includes(name));
  } else if (options.excludeDestructive) {
    result = candidates.filter((tool) => tool.scope !== "destructive").map((tool) => tool.name);
  } else if (options.yes) {
    result = candidates.map((tool) => tool.name);
  } else {
    return undefined;
  }
  if (result.length === 0) {
    throw new Error("No tools would be exposed with the current flags — refusing to activate a project with zero mapped tools.");
  }
  return result;
}
