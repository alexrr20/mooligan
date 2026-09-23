import {
  drawComparisons,
  formatProbability,
  manaDrawTargets,
  manaTypeStyles,
  manaCurveLabel,
} from "@mooligan/presentation/deck-mana";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  drawProbability,
  manaDrawStats,
  type DeckManaAnalysis,
  type DrawComparison,
} from "@mooligan/workspace/client/deck-mana";
import { Choice, Copy, Field, Panel } from "@/components/ui";
import { useMooliganTheme } from "@/theme/theme-provider";

export function DeckManaAnalysis({ analysis }: { analysis: DeckManaAnalysis }) {
  const [production, setProduction] = useState("lands");
  const [drawTiming, setDrawTiming] = useState("play");
  const [target, setTarget] = useState("lands");
  const [comparison, setComparison] = useState<DrawComparison>("at-least");
  const [wanted, setWanted] = useState("2");
  const [draws, setDraws] = useState("7");
  const { palette } = useMooliganTheme();
  const stats = manaDrawStats(analysis, drawTiming === "draw");
  const targets = manaDrawTargets(analysis);
  const selected = targets.find((option) => option.value === target) ?? targets[0]!;
  const sourceKey = production === "lands" ? "landSources" : "sources";
  const pipTotal = analysis.colors.reduce((sum, color) => sum + color.pips, 0);
  const sourceTotal = analysis.colors.reduce((sum, color) => sum + color[sourceKey], 0);
  const maxCurve = Math.max(1, ...analysis.curve.map((bucket) => bucket.total));
  const validInputs = /^\d+$/u.test(wanted) && /^\d+$/u.test(draws) && Number(draws) <= 1000;
  const probability =
    validInputs && !analysis.unknownLibrary
      ? drawProbability(
          analysis.librarySize,
          selected.quantity,
          Number(draws),
          Number(wanted),
          comparison,
        )
      : null;

  if (!analysis.librarySize && !analysis.spellCount && !analysis.unknown) {
    return (
      <Copy title="Mana analysis">
        Add cards to your main deck to see its curve, color balance, and draw odds.
      </Copy>
    );
  }
  return (
    <>
      <Copy title="Mana analysis">
        Main deck and commanders. Draw odds use the {analysis.librarySize}-card library.
      </Copy>
      {analysis.unknown > 0 && (
        <Copy>
          Analysis is incomplete. {analysis.unknown} copies have protected or unavailable details.
          Library odds wait for complete data.
        </Copy>
      )}
      {analysis.unknownManaValue > 0 && (
        <Copy>
          {analysis.unknownManaValue} nonland copies have no mana value and are excluded from the
          curve and averages.
        </Copy>
      )}
      <Panel>
        <Copy title={analysis.averageMana?.toFixed(2) ?? "Unavailable"}>
          Average mana value without lands. Including lands:{" "}
          {analysis.averageWithLands?.toFixed(2) ?? "unavailable"}. Total mana value:{" "}
          {analysis.manaTotal}.
        </Copy>
        <Copy>
          {analysis.lands} lands in library, including {analysis.modalLands} modal land cards.{" "}
          {analysis.nonlandSources} other mana sources.
        </Copy>
      </Panel>
      <Panel>
        <Copy title="Mana curve">
          {analysis.spellCount} nonland cards, including commanders. Bright bars show permanents;
          muted bars show instants and sorceries.
        </Copy>
        {analysis.curve.map((bucket) => (
          <View key={manaCurveLabel(bucket.value)}>
            <Copy>
              Mana value {manaCurveLabel(bucket.value)}: {bucket.total} cards · {bucket.permanents}{" "}
              permanents · {bucket.nonpermanents} instants and sorceries
            </Copy>
            <View style={[styles.track, { backgroundColor: palette.border }]} accessible={false}>
              <View
                style={{
                  width: `${(bucket.permanents / maxCurve) * 100}%`,
                  backgroundColor: palette.accent,
                }}
              />
              <View
                style={{
                  width: `${(bucket.nonpermanents / maxCurve) * 100}%`,
                  backgroundColor: palette.accent,
                  opacity: 0.45,
                }}
              />
            </View>
          </View>
        ))}
        <Copy>
          Mana value uses X = 0. Split cards use their combined value; double-faced cards and
          Adventures use their front face.
        </Copy>
      </Panel>
      <Panel>
        <Copy title="Color demand & sources" />
        <Choice
          label="Count sources"
          value={production}
          onChange={setProduction}
          options={[
            { value: "lands", label: "Lands only" },
            { value: "all", label: "All sources" },
          ]}
        />
        {analysis.colors.map((color) => (
          <View key={color.value}>
            <Copy>
              {manaTypeStyles[color.value].label}: {Number(color.pips.toFixed(1))} pips ·{" "}
              {Math.round(pipTotal ? (color.pips / pipTotal) * 100 : 0)}% of costs.{" "}
              {color[sourceKey]} sources ·{" "}
              {Math.round(sourceTotal ? (color[sourceKey] / sourceTotal) * 100 : 0)}% of sources.
            </Copy>
            <View style={[styles.track, { backgroundColor: palette.border }]} accessible={false}>
              <View
                style={{
                  width: `${pipTotal ? (color.pips / pipTotal) * 100 : 0}%`,
                  backgroundColor: manaTypeStyles[color.value].color,
                }}
              />
            </View>
            <View style={[styles.track, { backgroundColor: palette.border }]} accessible={false}>
              <View
                style={{
                  width: `${sourceTotal ? (color[sourceKey] / sourceTotal) * 100 : 0}%`,
                  backgroundColor: manaTypeStyles[color.value].color,
                  opacity: 0.45,
                }}
              />
            </View>
          </View>
        ))}
        <Copy>
          Each source counts once per color, including conditional abilities. Shares use
          color-source counts, not mana output. Fetch targets and token production are not inferred.
          Hybrid pips split between colors; Phyrexian pips count as colored. Generic costs are
          excluded.
        </Copy>
      </Panel>
      <Panel>
        <Copy title="Opening hand">
          Your first {stats.handSize} cards contain an average of{" "}
          {stats.expectedLands?.toFixed(2) ?? "an unknown number of"} lands.
        </Copy>
        {stats.opening.map(({ count, probability }) => (
          <Copy key={count}>
            {count} {count === 1 ? "land" : "lands"}: {formatProbability(probability)}
          </Copy>
        ))}
        <Copy>
          Random opening hand before mulligans. Modal land cards count as lands and cannot also be
          cast as spells.
        </Copy>
      </Panel>
      <Panel>
        <Copy title="Land availability by turn">Chance to draw N lands by turn N.</Copy>
        <Choice
          label="First turn"
          value={drawTiming}
          onChange={setDrawTiming}
          options={[
            { value: "play", label: "Skip first draw" },
            { value: "draw", label: "Draw a card" },
          ]}
        />
        {stats.turns.map(({ turn, seen, probability }) => (
          <Copy key={turn}>
            Turn {turn}: {formatProbability(probability)} · {seen} cards seen
          </Copy>
        ))}
        <Copy>
          Choose "Draw a card" for multiplayer Commander or being on the draw. Assumes one draw per
          turn, no mulligans or extra draw. These are draw odds, not casting odds: colors, tapped
          lands, ramp, and land sequencing are not modeled.
        </Copy>
      </Panel>
      <Panel>
        <Copy title="Draw probability" />
        <Choice
          label="Draw"
          value={comparison}
          onChange={setComparison}
          options={drawComparisons}
        />
        <Field
          label="Copies wanted"
          value={wanted}
          onChangeText={setWanted}
          keyboardType="number-pad"
        />
        <Choice label="Of" value={selected.value} onChange={setTarget} options={targets} />
        <Field label="Cards seen" value={draws} onChangeText={setDraws} keyboardType="number-pad" />
        <Copy title={formatProbability(probability)}>
          {selected.quantity} matching copies / {analysis.librarySize} cards.
        </Copy>
        <Copy>
          Cards seen includes your opening hand. Enter whole numbers, with cards seen no greater
          than the library size or 1,000. Commanders, companions, sideboard, and maybeboard stay
          outside the library. Color-source odds mean drawing that source, not having its mana
          available.
        </Copy>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 2, overflow: "hidden", flexDirection: "row", marginTop: 5 },
});
