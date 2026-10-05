import { expect, test } from "bun:test";
import {
  leafCount,
  pendingChanges,
  planEqualize,
  type LayoutNode,
} from "./equalize-splits";

const pane = (id: string): LayoutNode => ({ type: "pane", pane_id: id });

const split = (
  direction: "right" | "down",
  ratio: number,
  first: LayoutNode,
  second: LayoutNode,
): LayoutNode => ({ type: "split", direction, ratio, first, second });

/** Independent oracle: leaf areas of a unit rectangle under the given ratios. */
function leafAreas(
  node: LayoutNode,
  w = 1,
  h = 1,
  out: Record<string, number> = {},
): Record<string, number> {
  if (node.type === "pane") {
    out[node.pane_id ?? "?"] = w * h;
    return out;
  }
  const r = node.ratio;
  if (node.direction === "right") {
    leafAreas(node.first, w * r, h, out);
    leafAreas(node.second, w * (1 - r), h, out);
  } else {
    leafAreas(node.first, w, h * r, out);
    leafAreas(node.second, w, h * (1 - r), out);
  }
  return out;
}

function applyPlan(node: LayoutNode, path: boolean[] = []): LayoutNode {
  if (node.type === "pane") return node;
  const plan = planEqualize(node).find(
    (p) => p.path.length === 0,
  );
  return {
    ...node,
    ratio: plan ? plan.ratio : node.ratio,
    first: applyPlan(node.first, [...path, false]),
    second: applyPlan(node.second, [...path, true]),
  };
}

test("nested same-direction three panes plan 1/3 at root and 1/2 nested", () => {
  const root = split(
    "right",
    0.5,
    pane("a"),
    split("right", 0.5, pane("b"), pane("c")),
  );

  expect(leafCount(root)).toBe(3);
  const plans = planEqualize(root);
  expect(plans.map((p) => p.path)).toEqual([[], [true]]);
  expect(plans[0]!.ratio).toBeCloseTo(1 / 3, 6);
  expect(plans[1]!.ratio).toBeCloseTo(0.5, 6);
  expect(plans.every((p) => p.representable)).toBe(true);

  const areas = leafAreas(applyPlan(root));
  expect(areas.a).toBeCloseTo(1 / 3, 6);
  expect(areas.b).toBeCloseTo(1 / 3, 6);
  expect(areas.c).toBeCloseTo(1 / 3, 6);
});

test("mixed-orientation tree equalizes area, not span", () => {
  const root = split(
    "right",
    0.5,
    pane("a"),
    split("down", 0.5, pane("b"), pane("c")),
  );

  const plans = planEqualize(root);
  expect(plans[0]!.path).toEqual([]);
  expect(plans[0]!.ratio).toBeCloseTo(1 / 3, 6);
  expect(plans[1]!.ratio).toBeCloseTo(0.5, 6);

  const areas = leafAreas(applyPlan(root));
  for (const id of ["a", "b", "c"]) {
    expect(areas[id]).toBeCloseTo(1 / 3, 6);
  }
});

test("single leaf is a no-op", () => {
  expect(planEqualize(pane("a"))).toEqual([]);
  expect(leafCount(pane("a"))).toBe(1);
});

test("already equalized tree has no pending changes (idempotent)", () => {
  const root = split(
    "right",
    1 / 3,
    pane("a"),
    split("right", 0.5, pane("b"), pane("c")),
  );
  expect(pendingChanges(planEqualize(root))).toEqual([]);
});

test("near-target drift is pending, f32 round-trip noise is not", () => {
  const equalized = (rootRatio: number, nestedRatio: number): LayoutNode =>
    split(
      "right",
      rootRatio,
      pane("a"),
      split("right", nestedRatio, pane("b"), pane("c")),
    );

  // Hand-dragged divider: 6.6e-4 off equal area, must still be corrected.
  expect(pendingChanges(planEqualize(equalized(0.334, 0.5)))).toHaveLength(1);

  // Ratios round-trip through f32 (~1.2e-8 off), which must not trigger a retry.
  const roundTrip = equalized(Math.fround(1 / 3), Math.fround(0.5));
  expect(pendingChanges(planEqualize(roundTrip))).toEqual([]);
});

test("ratio below the 0.1 server clamp is reported unrepresentable", () => {
  // 1 leaf against 10 leaves -> 1/11 == 0.0909..., below Herdr's 0.1 clamp.
  let chain: LayoutNode = pane("p10");
  for (let i = 9; i >= 1; i--) {
    chain = split("down", 0.5, pane(`p${i}`), chain);
  }
  const root = split("right", 0.5, pane("a"), chain);

  expect(leafCount(root)).toBe(11);
  const plans = planEqualize(root);
  const rootPlan = plans.find((p) => p.path.length === 0)!;
  expect(rootPlan.ratio).toBeCloseTo(1 / 11, 6);
  expect(rootPlan.representable).toBe(false);
  expect(plans.filter((p) => !p.representable)).toHaveLength(1);
});
