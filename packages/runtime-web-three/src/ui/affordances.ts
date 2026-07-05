import type { IUiIr } from "@threenative/ir";

export interface IUiToastQueueTrace {
  coalesced: Array<{ count: number; id: string; text: string }>;
  queue: string;
  visible: Array<{ count: number; id: string; text: string }>;
}

interface IToastTraceEntry {
  count: number;
  id: string;
  priority?: number;
  text: string;
}

export function traceUiToastQueue(ui: IUiIr, queueId: string): IUiToastQueueTrace {
  const queue = ui.toastQueues?.find((candidate) => candidate.id === queueId);
  if (queue === undefined) {
    return { coalesced: [], queue: queueId, visible: [] };
  }
  const coalesce = queue.coalesce ?? "none";
  const entries: IToastTraceEntry[] = coalesce === "count" ? coalescedToasts(queue.toasts ?? []) : (queue.toasts ?? []).map((toast) => ({ count: 1, id: toast.id, priority: toast.priority, text: toast.text }));
  const sorted = queue.priority === "high-first"
    ? [...entries].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id))
    : entries;
  const visible = sorted.slice(0, queue.maxVisible).map(({ count, id, text }) => ({ count, id, text }));
  return {
    coalesced: sorted.filter((toast) => toast.count > 1).map(({ count, id, text }) => ({ count, id, text })),
    queue: queue.id,
    visible,
  };
}

function coalescedToasts(toasts: NonNullable<NonNullable<IUiIr["toastQueues"]>[number]["toasts"]>): IToastTraceEntry[] {
  const byText = new Map<string, IToastTraceEntry>();
  for (const toast of toasts) {
    const key = toast.key ?? toast.text;
    const existing = byText.get(key);
    if (existing === undefined) {
      byText.set(key, { count: 1, id: toast.id, priority: toast.priority, text: toast.text });
    } else {
      existing.count += 1;
      existing.priority = Math.max(existing.priority ?? 0, toast.priority ?? 0);
    }
  }
  return [...byText.values()];
}
