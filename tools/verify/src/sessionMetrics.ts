export interface SessionCostMetrics {
  failedCommandCount: number;
  identicalAssertionRepeatCount: number;
  maxConsecutiveSameDiagnostic: number;
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
  const commandOutputs: CommandOutputForMetrics[] = [];

  for (const line of lines) {
    const event = parseEvent(line);
    if (event?.type !== "item.completed" || event.item?.type !== "command_execution") {
      continue;
    }
    const id = itemId(event);
    if (id !== undefined) {
      completedCommands.add(id);
    }
    const failed = event.item.status === "failed" || (typeof event.item.exit_code === "number" && event.item.exit_code !== 0);
    if (failed) {
      failedCommandCount += 1;
    }
    if (typeof event.item.aggregated_output === "string") {
      toolOutputBytes += Buffer.byteLength(event.item.aggregated_output, "utf8");
      commandOutputs.push({ failed, output: event.item.aggregated_output });
    }
  }
  const retryChains = deriveRetryChainMetrics(commandOutputs);

  return {
    failedCommandCount,
    identicalAssertionRepeatCount: retryChains.identicalAssertionRepeatCount,
    maxConsecutiveSameDiagnostic: retryChains.maxConsecutiveSameDiagnostic,
    toolOutputBytes,
    toolStepCount: completedCommands.size,
  };
}

export interface RetryChainMetrics {
  identicalAssertionRepeatCount: number;
  maxConsecutiveSameDiagnostic: number;
}

export interface CommandOutputForMetrics {
  failed: boolean;
  output: string;
}

export function deriveRetryChainMetrics(outputs: readonly CommandOutputForMetrics[]): RetryChainMetrics {
  let currentDiagnostic: string | undefined;
  let currentDiagnosticRepeats = 0;
  let maxConsecutiveSameDiagnostic = 0;
  let identicalAssertionRepeatCount = 0;
  const seenAssertions = new Set<string>();

  for (const output of outputs) {
    const parsed = parseJsonObject(output.output);
    const diagnostic = output.failed ? diagnosticSignature(parsed) : undefined;
    if (diagnostic !== undefined && diagnostic === currentDiagnostic) {
      currentDiagnosticRepeats += 1;
      maxConsecutiveSameDiagnostic = Math.max(maxConsecutiveSameDiagnostic, currentDiagnosticRepeats);
    } else {
      currentDiagnostic = diagnostic;
      currentDiagnosticRepeats = 0;
    }

    for (const assertion of assertionSignatures(parsed)) {
      if (seenAssertions.has(assertion)) {
        identicalAssertionRepeatCount += 1;
      } else {
        seenAssertions.add(assertion);
      }
    }
  }

  return { identicalAssertionRepeatCount, maxConsecutiveSameDiagnostic };
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

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function diagnosticSignature(value: Record<string, unknown> | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : [];
  const diagnostic = diagnostics.find((item): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item) && typeof item.code === "string"
  );
  if (diagnostic !== undefined) {
    return diagnostic.code as string;
  }
  return typeof value.code === "string" ? value.code : undefined;
}

function assertionSignatures(value: Record<string, unknown> | undefined): string[] {
  if (value === undefined || !Array.isArray(value.assertions)) {
    return [];
  }
  return value.assertions.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const assertion = item as Record<string, unknown>;
    if (assertion.pass !== false || typeof assertion.id !== "string") {
      return [];
    }
    return [`${assertion.id}:${stableJson(assertion.details ?? null)}`];
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function itemId(event: CodexEvent): string | undefined {
  const value = (event.item as { id?: unknown } | undefined)?.id;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
