import { useState, type ReactNode } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
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
  const maxOpening = Math.max(0.01, ...stats.opening.map(({ probability }) => probability ?? 0));
  const pipTotal = analysis.colors.reduce((sum, color) => sum + color.pips, 0);
  const sourceKey = production === "lands" ? "landSources" : "sources";
  const sourceTotal = analysis.colors.reduce((sum, color) => sum + color[sourceKey], 0);
  const colors = analysis.colors.filter((color) => color.pips > 0 || color[sourceKey] > 0);

  if (!analysis.librarySize && !analysis.spellCount && !analysis.unknown) {
    return (
      <p {...stylex.props(styles.muted)}>
        Add cards to your main deck to see its mana curve, color balance, and draw odds.
      </p>
    );
  }

  return (
    <section {...stylex.props(styles.analysis)} aria-label="Mana analysis">
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
        <Metric
          label="average mana value"
          value={analysis.averageMana?.toFixed(2) ?? "—"}
          detail={`Without lands. ${analysis.averageWithLands?.toFixed(2) ?? "—"} including lands; ${analysis.manaTotal.toLocaleString()} total mana value. Main deck and commanders.`}
        />
        <Metric
          label="lands"
          value={`${analysis.lands}/${analysis.librarySize}`}
          detail={`Lands in the ${analysis.librarySize}-card library.${analysis.modalLands ? ` Includes ${analysis.modalLands} modal land cards.` : ""}`}
        />
        <Metric
          label="other mana sources"
          value={String(analysis.nonlandSources)}
          detail="Nonland cards in the library that produce mana."
        />
      </dl>
      <div {...stylex.props(styles.grid)}>
        <Section
          title="Mana curve"
          info="Nonland cards, including commanders. Mana value uses X = 0. Split cards use their combined value; double-faced cards and Adventures use their front face."
          aside={
            <span {...stylex.props(styles.legend)}>
              <Key style={styles.permanent} />
              Permanents
              <Key style={styles.nonpermanent} />
              Instants & sorceries
            </span>
          }
        >
          <div {...stylex.props(styles.bars)} role="list" aria-label="Nonland cards by mana value">
            {analysis.curve.map((bucket) => (
              <div
                {...stylex.props(styles.column)}
                role="listitem"
                key={bucket.label}
                aria-label={`Mana value ${bucket.label}: ${bucket.total} cards, ${bucket.permanents} permanents, ${bucket.nonpermanents} instants and sorceries`}
              >
                <span {...stylex.props(styles.columnValue)}>{bucket.total || ""}</span>
                <div {...stylex.props(styles.track)} aria-hidden="true">
                  <div
                    {...stylex.props(
                      styles.bar((bucket.nonpermanents / maxCurve) * 100),
                      styles.nonpermanent,
                    )}
                  />
                  <div
                    {...stylex.props(
                      styles.bar((bucket.permanents / maxCurve) * 100),
                      styles.permanent,
                    )}
                  />
                </div>
                <span {...stylex.props(styles.columnLabel)}>{bucket.label}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Colors"
          info="Share of colored cost pips compared with share of color sources. Each source counts once per color it can produce, including conditional abilities. Fetch targets and token production are not inferred. Hybrid pips split between colors; Phyrexian pips count as colored. Generic costs are excluded."
          aside={
            <DeckSelect
              label="Count sources"
              hideLabel
              value={production}
              onChange={setProduction}
              options={[
                { value: "lands", label: "Land sources" },
                { value: "all", label: "All sources" },
              ]}
            />
          }
        >
          <span {...stylex.props(styles.legend, styles.colorLegend)}>
            <Key style={styles.demandKey} />
            Cost
            <Key style={styles.sourceKey} />
            Sources
          </span>
          <div
            {...stylex.props(styles.colors)}
            role="list"
            aria-label="Color cost and source shares"
          >
            {colors.map((color) => {
              const cost = pipTotal ? color.pips / pipTotal : 0;
              const sources = sourceTotal ? color[sourceKey] / sourceTotal : 0;
              return (
                <div
                  key={color.value}
                  role="listitem"
                  {...stylex.props(styles.colorRow)}
                  aria-label={`${color.label}: ${formatCount(color.pips)} pips, ${Math.round(cost * 100)}% of cost; ${color[sourceKey]} sources, ${Math.round(sources * 100)}% of sources`}
                >
                  <ManaSymbol token={`{${color.value}}`} />
                  <div {...stylex.props(styles.colorBars)} aria-hidden="true">
                    <span {...stylex.props(styles.colorBar(cost * 100, color.color))} />
                    <span
                      {...stylex.props(
                        styles.colorBar(sources * 100, color.color),
                        styles.sourceBar,
                      )}
                    />
                  </div>
                  <span {...stylex.props(styles.colorShare)} aria-hidden="true">
                    {Math.round(cost * 100)}%
                    <span {...stylex.props(styles.faint)}> / {Math.round(sources * 100)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
        <Section
          title="Opening hand"
          info="Land counts in a random opening hand before mulligans. Modal land cards count as lands and cannot also be cast as spells."
          aside={
            <span {...stylex.props(styles.muted)}>
              <span {...stylex.props(styles.strong)}>{stats.expectedLands?.toFixed(1) ?? "—"}</span>{" "}
              lands expected
            </span>
          }
        >
          <div
            {...stylex.props(styles.bars)}
            role="list"
            aria-label="Opening hand land probabilities"
          >
            {stats.opening.map(({ count, probability }) => (
              <div
                {...stylex.props(styles.column)}
                role="listitem"
                key={count}
                aria-label={`${count} ${count === 1 ? "land" : "lands"}: ${formatProbability(probability)}`}
              >
                <span {...stylex.props(styles.columnValue)}>{percent(probability)}</span>
                <div {...stylex.props(styles.track, styles.shortTrack)} aria-hidden="true">
                  <div
                    {...stylex.props(
                      styles.bar(((probability ?? 0) / maxOpening) * 100),
                      styles.permanent,
                    )}
                  />
                </div>
                <span {...stylex.props(styles.columnLabel)}>{count}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Lands on curve"
          info="Chance to have drawn N lands by turn N. Choose “On the draw” for multiplayer Commander or being on the draw. Assumes one draw per turn, no mulligans or extra draw. These are draw odds, not casting odds: colors, tapped lands, ramp, and land sequencing are not modeled."
          aside={
            <DeckSelect
              label="First turn"
              hideLabel
              value={drawTiming}
              onChange={setDrawTiming}
              options={[
                { value: "play", label: "On the play" },
                { value: "draw", label: "On the draw" },
              ]}
            />
          }
        >
          <div {...stylex.props(styles.turns)} role="list" aria-label="Land availability">
            {stats.turns.map(({ turn, seen, probability }) => (
              <div
                key={turn}
                role="listitem"
                {...stylex.props(styles.turn)}
                aria-label={`Turn ${turn}: ${formatProbability(probability)}, ${seen} cards seen`}
              >
                <span {...stylex.props(styles.columnLabel)} aria-hidden="true">
                  T{turn}
                </span>
                <span {...stylex.props(styles.turnValue)} aria-hidden="true">
                  {percent(probability)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section
        title="Draw odds"
        info="Cards seen includes your opening hand. Commanders, companions, sideboard, and maybeboard stay outside the library. Color-source odds mean drawing that source, not having its mana available."
      >
        <div {...stylex.props(styles.calculator)}>
          <DeckSelect
            label="Draw"
            hideLabel
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
          <DeckSelect
            label="Of"
            hideLabel
            value={selected.value}
            onChange={setTarget}
            options={targets}
          />
          <span {...stylex.props(styles.muted)}>in</span>
          <AnalysisNumber
            label="Cards seen"
            value={cardsSeen}
            onChange={setDraws}
            max={Math.min(1000, analysis.librarySize)}
          />
          <span {...stylex.props(styles.muted)}>cards</span>
          <strong
            {...stylex.props(styles.result)}
            role="status"
            aria-live="polite"
            title={`${selected.quantity} matching copies / ${analysis.librarySize} cards`}
          >
            {percent(probability)}
          </strong>
        </div>
      </Section>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div />} {...stylex.props(styles.metric)}>
        <dt>{label}</dt>
        <dd {...stylex.props(styles.metricValue)}>{value}</dd>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function Section({
  title,
  info,
  aside,
  children,
}: {
  title: string;
  info: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section {...stylex.props(styles.section)} aria-label={title}>
      <div {...stylex.props(styles.sectionHeading)}>
        <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
        <Tooltip>
          <TooltipTrigger
            aria-label={`About ${title.toLowerCase()}`}
            {...stylex.props(styles.info)}
          >
            ⓘ
          </TooltipTrigger>
          <TooltipContent>{info}</TooltipContent>
        </Tooltip>
        <div {...stylex.props(styles.aside)}>{aside}</div>
      </div>
      {children}
    </section>
  );
}

function Key({ style }: { style: stylex.StyleXStyles }) {
  return <i aria-hidden="true" {...stylex.props(styles.key, style)} />;
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
    <NumberField
      min={0}
      max={max}
      step={1}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      style={styles.number}
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
  );
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = stylex.create({
  analysis: { display: "grid", gap: "40px", fontVariantNumeric: "tabular-nums" },
  muted: { margin: 0, color: "#a6a89d" },
  faint: { color: "#6f7268" },
  strong: { color: "#f4f1e8" },
  notice: { margin: 0, color: "#dbcda9" },
  metrics: { display: "flex", flexWrap: "wrap", gap: "12px 40px", margin: 0 },
  metric: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    color: "#a6a89d",
    cursor: "help",
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "4px" },
  },
  metricValue: {
    order: -1,
    margin: 0,
    color: "#f4f1e8",
    fontSize: "22px",
    letterSpacing: "-0.5px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "48px 64px",
    "@media (max-width: 1100px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  section: { display: "grid", alignContent: "start", gap: "20px", minWidth: 0 },
  sectionHeading: { display: "flex", alignItems: "center", gap: "8px", minHeight: "28px" },
  sectionTitle: { margin: 0, fontSize: "15px", fontWeight: 500 },
  info: {
    padding: 0,
    borderWidth: 0,
    borderRadius: "2px",
    backgroundColor: "transparent",
    color: "#6f7268",
    font: "inherit",
    cursor: "help",
    ":hover": { color: "#a6a89d" },
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "2px" },
  },
  aside: { marginInlineStart: "auto", minWidth: 0 },
  legend: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    color: "#a6a89d",
    fontSize: "11px",
  },
  key: {
    width: "8px",
    height: "8px",
    borderRadius: "2px",
    marginInlineStart: "8px",
    ":first-child": { marginInlineStart: 0 },
  },
  permanent: { backgroundColor: "#c4ef8c" },
  nonpermanent: { backgroundColor: "#739986" },
  demandKey: { backgroundColor: "#d5d5c9" },
  sourceKey: { backgroundColor: "#d5d5c959" },
  bars: { display: "flex", gap: "8px" },
  column: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    textAlign: "center",
  },
  columnValue: { minHeight: "18px", fontSize: "12px", color: "#f4f1e8" },
  columnLabel: { fontSize: "12px", color: "#a6a89d" },
  track: {
    height: "140px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  shortTrack: { height: "80px" },
  bar: (height: number) => ({
    width: "100%",
    maxWidth: "36px",
    marginInline: "auto",
    height: `${height}%`,
    borderRadius: "1px",
  }),
  colors: { display: "grid", gap: "14px" },
  colorLegend: { marginBlockEnd: "-8px" },
  colorRow: {
    display: "grid",
    gridTemplateColumns: "18px minmax(24px, 1fr) 84px",
    gap: "12px",
    alignItems: "center",
  },
  colorBars: { display: "grid", gap: "4px" },
  colorBar: (width: number, color: string) => ({
    display: "block",
    height: "5px",
    width: `${width}%`,
    borderRadius: "1px",
    backgroundColor: color,
  }),
  sourceBar: { opacity: 0.4 },
  colorShare: { fontSize: "12px", textAlign: "right", color: "#f4f1e8" },
  turns: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "20px 16px",
  },
  turn: { display: "grid", gap: "2px", minWidth: 0 },
  turnValue: { fontSize: "18px", letterSpacing: "-0.5px" },
  calculator: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" },
  number: { width: "112px" },
  result: {
    marginInlineStart: "auto",
    fontSize: "22px",
    fontWeight: 500,
    color: "#c4ef8c",
    letterSpacing: "-0.5px",
  },
});
