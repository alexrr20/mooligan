import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { DeckManaAnalysis } from "@mooligan/workspace/client/deck-mana";
import {
  drawComparisons,
  drawProbability,
  formatProbability,
  manaDrawStats,
  manaDrawTargets,
  type DrawComparison,
} from "@mooligan/workspace/client/deck-mana";

import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement,
} from "../../components/ui/number-field";
import { ManaSymbol } from "../cards/oracle-text";
import { DeckSelect } from "./deck-controls";

export function DeckManaAnalysis({ analysis }: { analysis: DeckManaAnalysis }) {
  const [production, setProduction] = useState("lands");
  const [drawTiming, setDrawTiming] = useState("play");
  const [target, setTarget] = useState("lands");
  const [comparison, setComparison] = useState<DrawComparison>("at-least");
  const [wanted, setWanted] = useState(2);
  const [draws, setDraws] = useState(7);
  const stats = manaDrawStats(analysis, drawTiming === "draw");
  const targets = manaDrawTargets(analysis);
  const selected = targets.find((option) => option.value === target) ?? targets[0]!;
  const cardsSeen = Math.min(draws, analysis.librarySize);
  const probability = analysis.unknownLibrary
    ? null
    : drawProbability(analysis.librarySize, selected.quantity, cardsSeen, wanted, comparison);
  const maxCurve = Math.max(1, ...analysis.curve.map((bucket) => bucket.total));
  const pipTotal = analysis.colors.reduce((sum, color) => sum + color.pips, 0);
  const sourceKey = production === "lands" ? "landSources" : "sources";
  const sourceTotal = analysis.colors.reduce((sum, color) => sum + color[sourceKey], 0);

  if (!analysis.librarySize && !analysis.spellCount && !analysis.unknown) {
    return (
      <div {...stylex.props(styles.empty)}>
        <h2 {...stylex.props(styles.emptyTitle)}>Start with a few cards</h2>
        <p>Add cards to your main deck to see its mana curve, color balance, and draw odds.</p>
      </div>
    );
  }

  return (
    <section {...stylex.props(styles.analysis)} aria-label="Mana analysis">
      <div {...stylex.props(styles.heading)}>
        <div>
          <h2 {...stylex.props(styles.title)}>Know your mana.</h2>
          <p {...stylex.props(styles.subtitle)}>
            Main deck and commanders. Draw odds use the {analysis.librarySize}-card library.
          </p>
        </div>
        <span {...stylex.props(styles.local)}>Calculated locally</span>
      </div>
      {analysis.unknown > 0 && (
        <p {...stylex.props(styles.notice)} role="status">
          Analysis is incomplete. {analysis.unknown} card copies have protected or unavailable
          details. Their identities stay hidden; library odds wait for complete data.
        </p>
      )}
      {analysis.unknownManaValue > 0 && (
        <p {...stylex.props(styles.notice)}>
          {analysis.unknownManaValue} nonland copies have no mana value and are excluded from the
          curve and averages.
        </p>
      )}
      <dl {...stylex.props(styles.metrics)}>
        <div>
          <dt {...stylex.props(styles.metricLabel)}>Average mana value</dt>
          <dd {...stylex.props(styles.metricValue)}>{analysis.averageMana?.toFixed(2) ?? "—"}</dd>
          <span {...stylex.props(styles.metricCaption)}>without lands</span>
        </div>
        <div>
          <dt {...stylex.props(styles.metricLabel)}>Including lands</dt>
          <dd {...stylex.props(styles.metricValue)}>
            {analysis.averageWithLands?.toFixed(2) ?? "—"}
          </dd>
          <span {...stylex.props(styles.metricCaption)}>
            {analysis.manaTotal.toLocaleString()} total mana value
          </span>
        </div>
        <div>
          <dt {...stylex.props(styles.metricLabel)}>Lands in library</dt>
          <dd {...stylex.props(styles.metricValue)}>
            {analysis.lands}
            <small {...stylex.props(styles.metricTotal)}> / {analysis.librarySize}</small>
          </dd>
          <span {...stylex.props(styles.metricCaption)}>
            {analysis.modalLands
              ? `includes ${analysis.modalLands} modal land cards`
              : "main deck only"}
          </span>
        </div>
        <div>
          <dt {...stylex.props(styles.metricLabel)}>Other mana sources</dt>
          <dd {...stylex.props(styles.metricValue)}>{analysis.nonlandSources}</dd>
          <span {...stylex.props(styles.metricCaption)}>nonland cards in library</span>
        </div>
      </dl>
      <div {...stylex.props(styles.grid)}>
        <section {...stylex.props(styles.panel)} aria-labelledby="mana-curve-heading">
          <div {...stylex.props(styles.panelHeading)}>
            <div {...stylex.props(styles.headingText)}>
              <h3 {...stylex.props(styles.panelTitle)} id="mana-curve-heading">
                Mana curve
              </h3>
              <p {...stylex.props(styles.subtitle)}>
                {analysis.spellCount} nonland cards, including commanders
              </p>
            </div>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <i {...stylex.props(styles.legendKey, styles.permanent)} />
              Permanents
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <i {...stylex.props(styles.legendKey, styles.nonpermanent)} />
              Instants & sorceries
            </span>
          </div>
          <div {...stylex.props(styles.curve)} role="list" aria-label="Nonland cards by mana value">
            {analysis.curve.map((bucket) => (
              <div
                {...stylex.props(styles.curveColumn)}
                role="listitem"
                key={bucket.label}
                aria-label={`Mana value ${bucket.label}: ${bucket.total} cards, ${bucket.permanents} permanents, ${bucket.nonpermanents} instants and sorceries`}
              >
                <span {...stylex.props(styles.curveCount)}>{bucket.total}</span>
                <div {...stylex.props(styles.curveTrack)} aria-hidden="true">
                  <div
                    {...stylex.props(
                      styles.curveBar((bucket.nonpermanents / maxCurve) * 100),
                      styles.nonpermanent,
                    )}
                  />
                  <div
                    {...stylex.props(
                      styles.curveBar((bucket.permanents / maxCurve) * 100),
                      styles.permanent,
                    )}
                  />
                </div>
                <span {...stylex.props(styles.curveLabel)}>{bucket.label}</span>
              </div>
            ))}
          </div>
          <p {...stylex.props(styles.footnote)}>
            Mana value uses X = 0. Split cards use their combined value; double-faced cards and
            Adventures use their front face.
          </p>
        </section>
        <section {...stylex.props(styles.panel)} aria-labelledby="mana-colors-heading">
          <div {...stylex.props(styles.panelHeading)}>
            <div {...stylex.props(styles.headingText)}>
              <h3 {...stylex.props(styles.panelTitle)} id="mana-colors-heading">
                Color demand & sources
              </h3>
              <p {...stylex.props(styles.subtitle)}>Cost pips compared with available sources</p>
            </div>
            <div {...stylex.props(styles.headingControl)}>
              <DeckSelect
                label="Count sources"
                value={production}
                onChange={setProduction}
                options={[
                  { value: "lands", label: "Lands only" },
                  { value: "all", label: "All sources" },
                ]}
              />
            </div>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <i {...stylex.props(styles.legendKey, styles.demandKey)} />
              Cost share
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <i {...stylex.props(styles.legendKey, styles.sourceKey)} />
              Source share
            </span>
          </div>
          <div {...stylex.props(styles.colors)}>
            {analysis.colors.map((color) => {
              const cost = pipTotal ? color.pips / pipTotal : 0;
              const sources = sourceTotal ? color[sourceKey] / sourceTotal : 0;
              return (
                <div key={color.value} {...stylex.props(styles.colorRow)}>
                  <span {...stylex.props(styles.colorName)}>
                    <ManaSymbol token={`{${color.value}}`} />
                    {color.label}
                  </span>
                  <div {...stylex.props(styles.colorBars)} aria-hidden="true">
                    <div {...stylex.props(styles.colorTrack)}>
                      <span {...stylex.props(styles.colorBar(cost * 100, color.color))} />
                    </div>
                    <div {...stylex.props(styles.colorTrack)}>
                      <span
                        {...stylex.props(
                          styles.colorBar(sources * 100, color.color),
                          styles.sourceBar,
                        )}
                      />
                    </div>
                  </div>
                  <div {...stylex.props(styles.colorNumbers)}>
                    <span {...stylex.props(styles.colorNumberLine)}>
                      {formatCount(color.pips)} pips{" "}
                      <strong {...stylex.props(styles.colorPercentage)}>
                        {Math.round(cost * 100)}%
                      </strong>
                    </span>
                    <span {...stylex.props(styles.colorNumberLine)}>
                      {color[sourceKey]} sources{" "}
                      <strong {...stylex.props(styles.colorPercentage)}>
                        {Math.round(sources * 100)}%
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p {...stylex.props(styles.footnote)}>
            Each source counts once per color it can produce, including conditional abilities.
            Shares use total color-source counts, not mana output. Fetch targets and token
            production are not inferred. Hybrid pips split between colors; Phyrexian pips count as
            colored. Generic costs are excluded.
          </p>
        </section>
        <section {...stylex.props(styles.panel)} aria-labelledby="mana-opening-heading">
          <div {...stylex.props(styles.panelHeading)}>
            <div {...stylex.props(styles.headingText)}>
              <h3 {...stylex.props(styles.panelTitle)} id="mana-opening-heading">
                Opening hand
              </h3>
              <p {...stylex.props(styles.subtitle)}>
                Land counts in your first {stats.handSize} cards
              </p>
            </div>
            <div {...stylex.props(styles.inlineStat)}>
              <strong {...stylex.props(styles.inlineStatValue)}>
                {stats.expectedLands?.toFixed(2) ?? "—"}
              </strong>
              <span {...stylex.props(styles.caption)}>expected lands</span>
            </div>
          </div>
          <div
            {...stylex.props(styles.opening)}
            role="list"
            aria-label="Opening hand land probabilities"
          >
            {stats.opening.map(({ count, probability }) => (
              <div {...stylex.props(styles.openingRow)} role="listitem" key={count}>
                <span {...stylex.props(styles.muted)}>
                  {count} {count === 1 ? "land" : "lands"}
                </span>
                <div {...stylex.props(styles.probabilityTrack)} aria-hidden="true">
                  <span {...stylex.props(styles.probabilityBar((probability ?? 0) * 100))} />
                </div>
                <strong {...stylex.props(styles.openingProbability)}>
                  {formatProbability(probability)}
                </strong>
              </div>
            ))}
          </div>
          <p {...stylex.props(styles.footnote)}>
            Random opening hand before mulligans. Modal land cards count as lands and cannot also be
            cast as spells.
          </p>
        </section>
        <section {...stylex.props(styles.panel)} aria-labelledby="mana-turns-heading">
          <div {...stylex.props(styles.panelHeading)}>
            <div {...stylex.props(styles.headingText)}>
              <h3 {...stylex.props(styles.panelTitle)} id="mana-turns-heading">
                Land availability by turn
              </h3>
              <p {...stylex.props(styles.subtitle)}>Chance to draw N lands by turn N</p>
            </div>
            <div {...stylex.props(styles.headingControl)}>
              <DeckSelect
                label="First turn"
                value={drawTiming}
                onChange={setDrawTiming}
                options={[
                  { value: "play", label: "Skip first draw" },
                  { value: "draw", label: "Draw a card" },
                ]}
              />
            </div>
          </div>
          <div {...stylex.props(styles.turns)} role="list" aria-label="Land availability">
            {stats.turns.map(({ turn, seen, probability }) => (
              <div key={turn} role="listitem" {...stylex.props(styles.turn)}>
                <span {...stylex.props(styles.caption)}>Turn {turn}</span>
                <strong {...stylex.props(styles.turnProbability)}>
                  {formatProbability(probability)}
                </strong>
                <div {...stylex.props(styles.probabilityTrack)} aria-hidden="true">
                  <span
                    {...stylex.props(
                      styles.probabilityBar((probability ?? 0) * 100),
                      styles.turnBar,
                    )}
                  />
                </div>
                <small {...stylex.props(styles.caption)}>{seen} cards seen</small>
              </div>
            ))}
          </div>
          <p {...stylex.props(styles.footnote)}>
            Choose “Draw a card” for multiplayer Commander or being on the draw. Assumes one draw
            per turn, no mulligans or extra draw. These are draw odds, not casting odds: colors,
            tapped lands, ramp, and land sequencing are not modeled.
          </p>
        </section>
      </div>
      <section {...stylex.props(styles.panel)} aria-labelledby="mana-calculator-heading">
        <div>
          <h3 {...stylex.props(styles.panelTitle)} id="mana-calculator-heading">
            Draw probability
          </h3>
          <p {...stylex.props(styles.subtitle)}>Find a land, a color source, or a specific card.</p>
        </div>
        <div {...stylex.props(styles.calculatorControls)}>
          <DeckSelect
            label="Draw"
            value={comparison}
            onChange={setComparison}
            options={drawComparisons}
          />
          <AnalysisNumber
            label="Copies wanted"
            value={wanted}
            onChange={setWanted}
            max={Math.max(1, analysis.librarySize)}
          />
          <DeckSelect label="Of" value={selected.value} onChange={setTarget} options={targets} />
          <AnalysisNumber
            label="Cards seen"
            value={cardsSeen}
            onChange={setDraws}
            max={Math.min(1000, analysis.librarySize)}
          />
          <div {...stylex.props(styles.calculatorResult)} role="status" aria-live="polite">
            <strong {...stylex.props(styles.calculatorProbability)}>
              {formatProbability(probability)}
            </strong>
            <span {...stylex.props(styles.caption)}>
              {selected.quantity} matching copies / {analysis.librarySize} cards
            </span>
          </div>
        </div>
        <p {...stylex.props(styles.footnote)}>
          Cards seen includes your opening hand. Commanders, companions, sideboard, and maybeboard
          stay outside the library. Color-source odds mean drawing that source, not having its mana
          available.
        </p>
      </section>
    </section>
  );
}

function AnalysisNumber({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
}) {
  return (
    <label {...stylex.props(styles.number)}>
      <span>{label}</span>
      <NumberField
        min={0}
        max={max}
        step={1}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <NumberFieldGroup>
          <NumberFieldDecrement aria-label={`Decrease ${label.toLowerCase()}`}>
            −
          </NumberFieldDecrement>
          <NumberFieldInput aria-label={label} />
          <NumberFieldIncrement aria-label={`Increase ${label.toLowerCase()}`}>
            +
          </NumberFieldIncrement>
        </NumberFieldGroup>
      </NumberField>
    </label>
  );
}

function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = stylex.create({
  analysis: { display: "grid", gap: "24px", fontVariantNumeric: "tabular-nums" },
  title: { margin: 0, fontWeight: 500, fontSize: "23px", letterSpacing: "-0.5px" },
  panelTitle: { margin: 0, fontWeight: 500, fontSize: "15px" },
  heading: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "16px",
    "@media (max-width: 600px)": { flexDirection: "column", gap: 0 },
  },
  panelHeading: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "16px",
    "@media (max-width: 600px)": { flexWrap: "wrap" },
  },
  headingText: { minWidth: 0 },
  headingControl: { minWidth: 0, flexShrink: 0 },
  subtitle: { color: "#a6a89d", margin: "4px 0 0", fontSize: "12px" },
  local: { fontSize: "11px", color: "#a6a89d", paddingTop: "6px", whiteSpace: "nowrap" },
  notice: {
    margin: 0,
    padding: "12px 16px",
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "#d6ba7d",
    backgroundColor: "#d6ba7d0a",
    color: "#dbcda9",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    margin: 0,
    padding: "20px 0",
    borderBlockWidth: "1px",
    borderBlockStyle: "solid",
    borderBlockColor: "#34362f",
    gap: "20px",
    "@media (max-width: 600px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  metricLabel: { color: "#a6a89d", fontSize: "12px" },
  metricValue: {
    margin: "5px 0 0",
    fontSize: "30px",
    fontWeight: 450,
    lineHeight: 1.3,
    letterSpacing: "-1px",
  },
  metricTotal: { fontSize: "16px", color: "#a6a89d", letterSpacing: 0 },
  metricCaption: { color: "#a6a89d", fontSize: "11px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "20px",
    "@media (max-width: 1100px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panel: {
    minWidth: 0,
    padding: "20px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#34362f",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    backgroundColor: "#171915",
    "@media (max-width: 600px)": { padding: "14px" },
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    color: "#a6a89d",
    fontSize: "11px",
  },
  legendItem: { display: "inline-flex", alignItems: "center", gap: "6px" },
  legendKey: { width: "8px", height: "8px", borderRadius: "2px" },
  permanent: { backgroundColor: "#c4ef8c" },
  nonpermanent: { backgroundColor: "#739986" },
  demandKey: { backgroundColor: "#d5d5c9" },
  sourceKey: { backgroundColor: "#d5d5c959" },
  curve: {
    display: "flex",
    gap: "10px",
    paddingTop: "12px",
    "@media (max-width: 600px)": { gap: "6px" },
  },
  curveColumn: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    textAlign: "center",
  },
  curveCount: { fontSize: "12px", color: "#f4f1e8" },
  curveTrack: {
    height: "150px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#55584f",
    backgroundImage:
      "repeating-linear-gradient(to top, transparent 0, transparent 49px, #ffffff06 49px, #ffffff06 50px)",
  },
  curveBar: (height: number) => ({
    width: "100%",
    maxWidth: "44px",
    marginInline: "auto",
    height: `${height}%`,
  }),
  curveLabel: { fontSize: "12px", color: "#a6a89d" },
  footnote: {
    fontSize: "11px",
    lineHeight: 1.6,
    color: "#a6a89d",
    margin: "auto 0 0",
    paddingTop: "2px",
  },
  colors: { display: "grid", gap: "12px" },
  colorRow: {
    display: "grid",
    gridTemplateColumns: "86px minmax(24px, 1fr) 116px",
    gap: "12px",
    alignItems: "center",
    "@media (max-width: 600px)": {
      gridTemplateColumns: "75px minmax(24px, 1fr) 105px",
      gap: "8px",
    },
  },
  colorName: { display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px" },
  colorBars: { display: "grid", gap: "5px" },
  colorTrack: {
    height: "6px",
    backgroundColor: "#ffffff06",
    borderRadius: "1px",
    overflow: "hidden",
  },
  colorBar: (width: number, color: string) => ({
    display: "block",
    height: "100%",
    minWidth: 0,
    width: `${width}%`,
    backgroundColor: color,
  }),
  sourceBar: { opacity: 0.4 },
  colorNumbers: { fontSize: "10px", display: "grid", gap: "1px", color: "#a6a89d" },
  colorNumberLine: { display: "flex", justifyContent: "space-between", gap: "5px" },
  colorPercentage: { color: "#f4f1e8", fontWeight: 500 },
  inlineStat: {
    display: "flex",
    flexDirection: "column",
    textAlign: "right",
    minWidth: 0,
    flexShrink: 0,
  },
  inlineStatValue: { fontSize: "25px", color: "#c4ef8c", lineHeight: 1.2, fontWeight: 500 },
  caption: { fontSize: "10px", color: "#a6a89d" },
  muted: { color: "#a6a89d" },
  opening: { display: "grid", gap: "10px" },
  openingRow: {
    display: "grid",
    gridTemplateColumns: "46px minmax(24px, 1fr) 74px",
    alignItems: "center",
    gap: "12px",
    fontSize: "11px",
  },
  openingProbability: { fontWeight: 500, textAlign: "right" },
  probabilityTrack: {
    height: "5px",
    backgroundColor: "#ffffff08",
    borderRadius: "1px",
    overflow: "hidden",
  },
  probabilityBar: (width: number) => ({
    display: "block",
    height: "100%",
    backgroundColor: "#c4ef8c",
    width: `${width}%`,
  }),
  turns: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "24px 16px",
    "@media (max-width: 600px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  turn: { display: "grid", gap: "6px", minWidth: 0 },
  turnProbability: { fontSize: "18px", fontWeight: 500, letterSpacing: "-0.5px" },
  turnBar: { backgroundColor: "#8bac7a" },
  calculatorControls: {
    display: "grid",
    gridTemplateColumns: "100px 128px minmax(150px, 1fr) 128px minmax(140px, 0.7fr)",
    alignItems: "end",
    gap: "16px",
    "@media (max-width: 1100px)": { gridTemplateColumns: "1fr 1fr" },
  },
  number: { display: "grid", gap: "4px", minWidth: 0, fontSize: "12px" },
  calculatorResult: {
    display: "grid",
    justifyContent: "end",
    textAlign: "right",
    gap: "3px",
    minWidth: 0,
    "@media (max-width: 1100px)": { justifyContent: "start", textAlign: "left" },
  },
  calculatorProbability: {
    fontSize: "30px",
    fontWeight: 500,
    lineHeight: 1.1,
    color: "#c4ef8c",
    letterSpacing: "-1px",
  },
  empty: {
    padding: "48px 20px",
    textAlign: "center",
    color: "#a6a89d",
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "#34362f",
    borderRadius: "6px",
  },
  emptyTitle: { margin: 0, fontWeight: 500, color: "#f4f1e8", fontSize: "20px" },
});
