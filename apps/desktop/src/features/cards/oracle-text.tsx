import type { CSSProperties } from "react";

export type OracleTextToken =
  | { type: "newline"; value: "\n" }
  | { type: "symbol"; value: string; symbol: ManaSymbolDefinition }
  | { type: "text"; value: string };

export type ManaSymbolDefinition = Readonly<{
  className: string;
  label: string;
}>;

type OracleTextProps = {
  className?: string;
  text: string;
};

type ManaSymbolProps = {
  className?: string;
  token: string;
};

const COLORS = {
  B: "black",
  G: "green",
  R: "red",
  U: "blue",
  W: "white",
} as const;

const SYMBOLS: Readonly<Record<string, ManaSymbolDefinition>> = createSymbolDefinitions();

// Keeping the canonical token as a selectable text node means a visual glyph
// never replaces the source text on the clipboard. `fontSize: 0` hides only
// its presentation; unlike display:none, it remains part of a selection.
const selectableTokenStyle: CSSProperties = {
  fontSize: 0,
  lineHeight: 0,
  userSelect: "text",
};

export function tokenizeOracleText(text: string): OracleTextToken[] {
  const result: OracleTextToken[] = [];
  let textStart = 0;
  let index = 0;

  const appendText = (end: number) => {
    if (end > textStart) {
      result.push({ type: "text", value: text.slice(textStart, end) });
    }
  };

  while (index < text.length) {
    const character = text[index];

    if (character === "\n" || character === "\r") {
      appendText(index);
      result.push({ type: "newline", value: "\n" });
      index += character === "\r" && text[index + 1] === "\n" ? 2 : 1;
      textStart = index;
      continue;
    }

    if (character === "{") {
      const closingBrace = text.indexOf("}", index + 1);
      if (closingBrace !== -1) {
        const value = text.slice(index, closingBrace + 1);
        const symbol = SYMBOLS[value];

        if (symbol) {
          appendText(index);
          result.push({ symbol, type: "symbol", value });
          index = closingBrace + 1;
          textStart = index;
          continue;
        }
      }
    }

    index += 1;
  }

  appendText(text.length);
  return result;
}

export function getManaSymbol(token: string): ManaSymbolDefinition | null {
  return SYMBOLS[token] ?? null;
}

export function ManaSymbol({ className, token }: ManaSymbolProps) {
  const symbol = getManaSymbol(token);

  if (!symbol) {
    return token;
  }

  return (
    <span
      className={className}
      data-mana-token={token}
      role="img"
      aria-label={symbol.label}
      title={token}
    >
      <span aria-hidden="true" style={selectableTokenStyle}>
        {token}
      </span>
      <i aria-hidden="true" className={symbol.className} />
    </span>
  );
}

export function OracleText({ className, text }: OracleTextProps) {
  return (
    <span className={className} data-oracle-text={text}>
      {tokenizeOracleText(text).map((token, index) => {
        if (token.type === "newline") {
          return <br key={index} />;
        }

        if (token.type === "symbol") {
          return <ManaSymbol key={index} token={token.value} />;
        }

        return token.value;
      })}
    </span>
  );
}

function createSymbolDefinitions() {
  const definitions: Record<string, ManaSymbolDefinition> = {};
  const add = (
    token: string,
    glyph: string,
    label: string,
    cost = false,
    extraClasses: readonly string[] = [],
  ) => {
    definitions[`{${token}}`] = {
      className: ["ms", `ms-${glyph}`, cost && "ms-cost", cost && "ms-shadow", ...extraClasses]
        .filter(Boolean)
        .join(" "),
      label,
    };
  };

  for (let value = 0; value <= 20; value += 1) {
    add(String(value), String(value), `${value} generic mana`, true);
  }
  add("100", "100", "100 generic mana", true);
  add("1000000", "1000000", "one million generic mana", true);

  for (const [color, name] of Object.entries(COLORS)) {
    add(color, color.toLowerCase(), `${name} mana`, true);
    add(`${color}/P`, `${color.toLowerCase()}p`, `${name} Phyrexian mana`, true);
    add(`2/${color}`, `2${color.toLowerCase()}`, `two generic or ${name} mana`, true);
    add(`C/${color}`, `c${color.toLowerCase()}`, `colorless or ${name} mana`, true);
    add(`H${color}`, color.toLowerCase(), `half ${name} mana`, true, ["ms-half"]);
  }

  const hybridPairs = [
    ["W", "U"],
    ["W", "B"],
    ["U", "B"],
    ["U", "R"],
    ["B", "R"],
    ["B", "G"],
    ["R", "W"],
    ["R", "G"],
    ["G", "W"],
    ["G", "U"],
  ] as const;
  for (const [first, second] of hybridPairs) {
    const pair = `${first}/${second}`;
    const glyph = `${first.toLowerCase()}${second.toLowerCase()}`;
    add(pair, glyph, `${COLORS[first]} or ${COLORS[second]} mana`, true);
    add(`${pair}/P`, `${glyph}p`, `${COLORS[first]} or ${COLORS[second]} Phyrexian mana`, true);
  }

  add("C", "c", "colorless mana", true);
  add("S", "s", "snow mana", true);
  add("X", "x", "X mana", true);
  add("Y", "y", "Y mana", true);
  add("Z", "z", "Z mana", true);
  add("P", "p", "Phyrexian mana", true);
  add("H", "h", "Phyrexian symbol", true);
  add("T", "tap", "tap");
  add("Q", "untap", "untap");
  add("E", "e", "energy counter");
  add("A", "acorn", "acorn counter");
  add("TK", "tk", "ticket counter");
  add("CHAOS", "chaos", "chaos");
  add("D", "d", "land drop");
  add("L", "l", "legendary mana", true);
  add("PAW", "paw", "pawprint counter");
  add("1/2", "1-2", "one-half generic mana", true);
  add("½", "1-2", "one-half generic mana", true);
  add("∞", "infinity", "infinite generic mana", true);

  return Object.freeze(definitions);
}
