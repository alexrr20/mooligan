import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeDeckMana } from "@mooligan/workspace/client/deck-mana";
import { formatProbability, manaCurveLabel, manaDrawTargets } from "../src/deck-mana.ts";

void test("mana presentation labels analysis values without changing their quantities", () => {
  const analysis = analyzeDeckMana([], new Map());
  analysis.lands = 24;
  analysis.colors.find(({ value }) => value === "G")!.landSources = 12;
  analysis.cards.push({ id: "bolt", name: "Lightning Bolt", quantity: 4 });
  const targets = manaDrawTargets(analysis);
  assert.deepEqual(
    targets.find(({ value }) => value === "mana:G"),
    {
      value: "mana:G",
      label: "Green land sources",
      quantity: 12,
    },
  );
  assert.deepEqual(
    targets.find(({ value }) => value === "card:bolt"),
    {
      value: "card:bolt",
      label: "Lightning Bolt",
      quantity: 4,
    },
  );
  assert.equal(targets[0]!.quantity, 24);
  assert.equal(manaCurveLabel(8), "8+");
  assert.equal(manaCurveLabel(0), "0");
  assert.equal(formatProbability(null), "Unavailable");
  assert.equal(formatProbability(0), "0.0%");
  assert.equal(formatProbability(0.125), "12.5%");
});
