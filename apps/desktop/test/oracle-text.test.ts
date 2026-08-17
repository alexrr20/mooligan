import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

type ManaSymbolDefinition = Readonly<{
  className: string;
  label: string;
}>;

type OracleTextToken =
  | { type: "newline"; value: "\n" }
  | { type: "symbol"; value: string; symbol: ManaSymbolDefinition }
  | { type: "text"; value: string };

type OracleTextModule = {
  getManaSymbol(token: string): ManaSymbolDefinition | null;
  ManaSymbol: ComponentType<{ token: string }>;
  OracleText: ComponentType<{ text: string }>;
  tokenizeOracleText(text: string): OracleTextToken[];
};

const oraclePath = fileURLToPath(new URL("../src/features/cards/oracle-text.tsx", import.meta.url));
const oracleSource = await readFile(oraclePath, "utf8");
const transformed = (await transformWithOxc(oracleSource, oraclePath, {})).code;
const jsxRuntimeUrl = import.meta.resolve("react/jsx-runtime");
const executable = transformed.replace(
  'from "react/jsx-runtime"',
  `from ${JSON.stringify(jsxRuntimeUrl)}`,
);
// SAFETY: the module is generated from the checked local oracle-text source and loaded immediately.
const oracle = (await import(
  `data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`
)) as OracleTextModule;

void test("tokenization preserves text, newlines, and recognized symbol order", () => {
  const tokens = oracle.tokenizeOracleText("Flying\r\n{2}{W/U}: Add {G}.\n\nDone");

  assert.deepEqual(
    tokens.map((token) => [token.type, token.value]),
    [
      ["text", "Flying"],
      ["newline", "\n"],
      ["symbol", "{2}"],
      ["symbol", "{W/U}"],
      ["text", ": Add "],
      ["symbol", "{G}"],
      ["text", "."],
      ["newline", "\n"],
      ["newline", "\n"],
      ["text", "Done"],
    ],
  );
});

void test("ordinary, hybrid, Phyrexian, variable, tap, and untap symbols are recognized", () => {
  const symbols = ["{G}", "{2/W}", "{W/U}", "{B/P}", "{W/U/P}", "{X}", "{T}", "{Q}"];

  for (const token of symbols) {
    const symbol = oracle.getManaSymbol(token);
    assert.ok(symbol, `${token} should be recognized`);
    assert.match(symbol.className, /\bms\b/);
  }

  assert.match(oracle.getManaSymbol("{G}")?.className ?? "", /\bms-g\b/);
  assert.match(oracle.getManaSymbol("{W/U}")?.className ?? "", /\bms-wu\b/);
  assert.match(oracle.getManaSymbol("{W/U}")?.className ?? "", /\bms-split\b/);
  assert.match(oracle.getManaSymbol("{2/W}")?.className ?? "", /\bms-split\b/);
  assert.match(oracle.getManaSymbol("{B/P}")?.label ?? "", /Phyrexian/i);
  assert.match(oracle.getManaSymbol("{T}")?.className ?? "", /\bms-tap\b/);
  assert.match(oracle.getManaSymbol("{Q}")?.className ?? "", /\bms-untap\b/);
});

void test("unknown and noncanonical brace tokens remain literal text", () => {
  const input = "Use {FUTURE}, {g}, and an unmatched {W safely.";

  assert.deepEqual(oracle.tokenizeOracleText(input), [{ type: "text", value: input }]);
  assert.equal(oracle.getManaSymbol("{FUTURE}"), null);
  assert.equal(
    renderToStaticMarkup(createElement(oracle.ManaSymbol, { token: "{FUTURE}" })),
    "{FUTURE}",
  );
});

void test("rendering escapes catalog text and never interprets it as HTML", () => {
  const html = renderToStaticMarkup(
    createElement(oracle.OracleText, {
      text: '<img src=x onerror="alert(1)"> {G}',
    }),
  );

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /class="ms ms-g ms-cost ms-shadow"/);
});

void test("rendered symbols expose accessible names and retain canonical copy text", () => {
  const html = renderToStaticMarkup(
    createElement(oracle.OracleText, { text: "Add {G}.\n{T}: Untap." }),
  );

  assert.match(html, /role="img" aria-label="green mana"/);
  assert.match(html, /role="img" aria-label="tap"/);
  assert.match(html, /data-mana-token="\{G\}"/);
  assert.match(html, />\{G\}<\/span><i aria-hidden="true" class="ms ms-g ms-cost ms-shadow"><\/i>/);
  assert.match(html, /<br\/>/);
});
