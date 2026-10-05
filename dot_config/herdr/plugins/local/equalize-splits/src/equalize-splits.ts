/**
 * Equalize pane area after any tiled pane is created.
 *
 * Runs as a `pane.created` event hook. Herdr has no equalize operation, so the
 * hook reproduces it over the released socket API: export the tab's BSP tree and
 * set every split ratio to leafCount(first)/leafCount(tree). That makes every
 * leaf equal *area* (not equal span) while preserving topology, orientations,
 * pane ids, PTYs, focus and cwd. `layout.apply` is never used: it rebuilds the
 * tab and would kill live processes.
 */

import { connect } from "node:net";

export type PaneNode = { type: "pane"; pane_id?: string };
export type SplitNode = {
  type: "split";
  direction: "right" | "down";
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};
export type LayoutNode = PaneNode | SplitNode;

/** Herdr clamps every split ratio into this range (src/layout.rs). */
export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;
/** Well above f32 round-trip noise (~1.2e-8), well below any visible drift. */
const EPSILON = 1e-6;

export type SplitPlan = {
  /** `false` = first, `true` = second; root split is `[]`. */
  path: boolean[];
  ratio: number;
  current: number;
  /** false when the server clamp makes the equal-area ratio unreachable. */
  representable: boolean;
};

export function leafCount(node: LayoutNode): number {
  return node.type === "pane"
    ? 1
    : leafCount(node.first) + leafCount(node.second);
}

/** Equal-area ratio for every split, in pre-order. */
export function planEqualize(node: LayoutNode, path: boolean[] = []): SplitPlan[] {
  if (node.type === "pane") return [];
  const first = leafCount(node.first);
  const ratio = first / (first + leafCount(node.second));
  return [
    {
      path,
      ratio,
      current: node.ratio,
      representable: ratio >= MIN_RATIO - 1e-9 && ratio <= MAX_RATIO + 1e-9,
    },
    ...planEqualize(node.first, [...path, false]),
    ...planEqualize(node.second, [...path, true]),
  ];
}

export function pendingChanges(plans: SplitPlan[]): SplitPlan[] {
  return plans.filter((p) => Math.abs(p.ratio - p.current) > EPSILON);
}

// --- socket client ---------------------------------------------------------

/**
 * One JSONL request per connection: the Herdr server answers a request and then
 * stops reading that connection, so a persistent session would hang on the
 * second request. `bun`'s `socket.setTimeout` does not fire either, hence the
 * explicit timer.
 */
function call(
  socketPath: string,
  method: string,
  params: unknown,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const done = Promise.withResolvers<Record<string, unknown>>();
  const socket = connect(socketPath);
  const timer = setTimeout(() => {
    done.reject(new Error(`${method} timed out after ${timeoutMs}ms`));
    socket.destroy();
  }, timeoutMs);
  let buffer = "";

  const finish = (settle: () => void) => {
    clearTimeout(timer);
    settle();
    socket.end();
  };

  socket.on("connect", () =>
    socket.write(`${JSON.stringify({ id: `equalize-splits:${method}`, method, params })}\n`),
  );
  socket.on("error", (err) => finish(() => done.reject(err)));
  socket.on("close", () =>
    finish(() => done.reject(new Error(`${method}: connection closed without a response`))),
  );
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const nl = buffer.indexOf("\n");
    if (nl < 0) return;
    let msg: { result?: unknown; error?: { code?: string; message?: string } };
    try {
      msg = JSON.parse(buffer.slice(0, nl));
    } catch (err) {
      finish(() => done.reject(err as Error));
      return;
    }
    finish(() =>
      msg.error
        ? done.reject(
            new Error(`${method}: ${msg.error.code ?? "error"} ${msg.error.message ?? ""}`.trim()),
          )
        : done.resolve((msg.result ?? {}) as Record<string, unknown>),
    );
  });

  return done.promise;
}

/** First value for `key` anywhere in an event payload of unpinned shape. */
function findString(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record[key] === "string") return record[key] as string;
    for (const nested of Object.values(record)) {
      const found = findString(nested, key);
      if (found) return found;
    }
  }
  return undefined;
}

async function main(): Promise<number> {
  const socketPath = process.env.HERDR_SOCKET_PATH;
  if (!socketPath) {
    console.error("equalize-splits: HERDR_SOCKET_PATH is not set");
    return 1;
  }

  let event: unknown = {};
  try {
    event = JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON ?? "{}");
  } catch {
    // fall back to env ids below
  }
  const target =
    findString(event, "tab_id") ??
    process.env.HERDR_TAB_ID ??
    findString(event, "pane_id") ??
    process.env.HERDR_PANE_ID;
  if (!target) {
    console.error("equalize-splits: no tab_id or pane_id in event context");
    return 1;
  }
  const exportParams = target.includes(":t")
    ? { tab_id: target }
    : { pane_id: target };

  // A split burst emits one hook per pane; re-export until the plan is a no-op
  // so concurrent hooks converge instead of fighting.
  for (let pass = 0; pass < 4; pass++) {
    const result = await call(socketPath, "layout.export", exportParams);
    // layout.export answers `{type:"layout_export", layout:{...}}`.
    const view = (result.layout ?? result) as Record<string, unknown>;
    const root = view.root as LayoutNode | undefined;
    const tabId = view.tab_id as string | undefined;
    if (!root || !tabId) {
      console.error("equalize-splits: layout.export returned no root/tab_id");
      return 1;
    }

    const plans = planEqualize(root);
    const impossible = plans.filter((p) => !p.representable);
    if (impossible.length > 0) {
      const detail = impossible
        .map(
          (p) =>
            `path=[${p.path.map((b) => (b ? "second" : "first")).join(",")}] ratio=${p.ratio.toFixed(4)}`,
        )
        .join("; ");
      console.error(
        `equalize-splits: equal area unreachable, Herdr clamps ratios to ${MIN_RATIO}..${MAX_RATIO}: ${detail}`,
      );
      return 1;
    }

    const pending = pendingChanges(plans);
    if (pending.length === 0) return 0;

    for (const plan of pending) {
      await call(socketPath, "layout.set_split_ratio", {
        tab_id: tabId,
        path: plan.path,
        ratio: plan.ratio,
      });
    }
    await Bun.sleep(40);
  }
  console.error("equalize-splits: layout did not converge after 4 passes");
  return 1;
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (err) {
    console.error(`equalize-splits: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
