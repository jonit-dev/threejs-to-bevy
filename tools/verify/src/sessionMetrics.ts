export interface SessionCostMetrics {
  failedCommandCount: number;
  toolOutputBytes: number;
  toolStepCount: number;
}

interface CodexEvent {
  item?: {
    aggregated_output?: unknown;
    exit_code?: unknown;
    status?: unknown;
    type?: unknown;
  };
  type?: unknown;
}

export function deriveSessionCostMetricsFromEvents(lines: readonly string[]): SessionCostMetrics {
  const completedCommands = new Set<string>();
  let failedCommandCount = 0;
  let toolOutputBytes = 0;

  for (const line of lines) {
    const event = parseEvent(line);
    if (event?.type !== "item.completed" || event.item?.type !== "command_execution") {
      continue;
    }
    const id = itemId(event);
    if (id !== undefined) {
      completedCommands.add(id);
    }
    if (event.item.status === "failed" || (typeof event.item.exit_code === "number" && event.item.exit_code !== 0)) {
      failedCommandCount += 1;
    }
    if (typeof event.item.aggregated_output === "string") {
      toolOutputBytes += Buffer.byteLength(event.item.aggregated_output, "utf8");
    }
  }

  return {
    failedCommandCount,
    toolOutputBytes,
    toolStepCount: completedCommands.size,
  };
}

function parseEvent(line: string): CodexEvent | undefined {
  if (line.trim() === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(line) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as CodexEvent : undefined;
  } catch {
    return undefined;
  }
}

function itemId(event: CodexEvent): string | undefined {
  const value = (event.item as { id?: unknown } | undefined)?.id;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
