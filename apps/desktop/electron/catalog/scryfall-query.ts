import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";

import { catalogVisibilityArguments, catalogVisibilitySqlFor } from "./visibility.ts";

type SearchParameter = string | number;

export type CompiledScryfallQuery =
  | {
      parameters: SearchParameter[];
      sql: string;
      success: true;
    }
  | {
      error: string;
      success: false;
    };

type SearchNode =
  | { children: SearchNode[]; type: "and" | "or" }
  | { child: SearchNode; type: "not" }
  | { raw: string; type: "term" };

type SearchToken =
  | { type: "left-parenthesis" | "right-parenthesis" }
  | { type: "or" }
  | { raw: string; type: "term" };

type SqlFragment = {
  parameters: SearchParameter[];
  sql: string;
};

type Comparison = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

const rarityOrder = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;
const colorNames = new Map([
  ["abzan", "WBG"],
  ["azorius", "WU"],
  ["bant", "WUG"],
  ["black", "B"],
  ["blue", "U"],
  ["boros", "WR"],
  ["c", ""],
  ["colorless", ""],
  ["dimir", "UB"],
  ["esper", "WUB"],
  ["fivecolor", "WUBRG"],
  ["golgari", "BG"],
  ["green", "G"],
  ["grixis", "UBR"],
  ["gruul", "RG"],
  ["izzet", "UR"],
  ["jeskai", "WUR"],
  ["jund", "BRG"],
  ["mardu", "WBR"],
  ["naya", "WRG"],
  ["orzhov", "WB"],
  ["rakdos", "BR"],
  ["red", "R"],
  ["selesnya", "WG"],
  ["simic", "UG"],
  ["sultai", "UBG"],
  ["temur", "URG"],
  ["white", "W"],
]);
const colorOrder = "WUBRG";
const cardFacesPath = "$.card_faces";
const cardTypeWords = new Set([
  "artifact",
  "battle",
  "conspiracy",
  "creature",
  "dungeon",
  "enchantment",
  "instant",
  "land",
  "phenomenon",
  "plane",
  "planeswalker",
  "scheme",
  "sorcery",
  "tribal",
  "vanguard",
]);

class SearchSyntaxError extends Error {}

export function compileScryfallQuery(
  query: string,
  visibility: SpoilerVisibilitySnapshot,
): CompiledScryfallQuery {
  try {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return { parameters: [], sql: "0", success: true };
    }

    const parser = new SearchParser(tokens);
    const fragment = compileNode(parser.parse(), visibility);
    return { ...fragment, success: true };
  } catch (error) {
    return {
      error:
        error instanceof SearchSyntaxError ? error.message : "The Scryfall query is not valid.",
      success: false,
    };
  }
}

class SearchParser {
  readonly #tokens: readonly SearchToken[];
  #position = 0;

  constructor(tokens: readonly SearchToken[]) {
    this.#tokens = tokens;
  }

  parse(): SearchNode {
    const expression = this.#parseOr();
    const token = this.#peek();
    if (token) {
      throw new SearchSyntaxError(
        token.type === "right-parenthesis"
          ? "Remove the unmatched closing parenthesis."
          : "The Scryfall query could not be parsed.",
      );
    }
    return expression;
  }

  #parseOr(): SearchNode {
    const children = [this.#parseAnd()];
    while (this.#peek()?.type === "or") {
      this.#position += 1;
      if (!this.#peek() || this.#peek()?.type === "right-parenthesis") {
        throw new SearchSyntaxError('Add another search term after "or".');
      }
      children.push(this.#parseAnd());
    }
    return children.length === 1 ? children[0]! : { children, type: "or" };
  }

  #parseAnd(): SearchNode {
    const children: SearchNode[] = [];
    while (
      this.#peek() &&
      this.#peek()?.type !== "or" &&
      this.#peek()?.type !== "right-parenthesis"
    ) {
      children.push(this.#parseUnary());
    }
    if (children.length === 0) {
      throw new SearchSyntaxError("Add a search term inside the parentheses.");
    }
    return children.length === 1 ? children[0]! : { children, type: "and" };
  }

  #parseUnary(): SearchNode {
    const token = this.#peek();
    if (token?.type === "term" && token.raw === "-") {
      this.#position += 1;
      return { child: this.#parseUnary(), type: "not" };
    }
    if (token?.type === "term" && token.raw.startsWith("-") && token.raw.length > 1) {
      this.#position += 1;
      return { child: { raw: token.raw.slice(1), type: "term" }, type: "not" };
    }
    return this.#parsePrimary();
  }

  #parsePrimary(): SearchNode {
    const token = this.#tokens[this.#position++];
    if (!token) {
      throw new SearchSyntaxError("The Scryfall query ends too early.");
    }
    if (token.type === "left-parenthesis") {
      const expression = this.#parseOr();
      if (this.#peek()?.type !== "right-parenthesis") {
        throw new SearchSyntaxError("Close the open parenthesis in the Scryfall query.");
      }
      this.#position += 1;
      return expression;
    }
    if (token.type !== "term") {
      throw new SearchSyntaxError("Add a search term before the closing parenthesis.");
    }
    return { raw: token.raw, type: "term" };
  }

  #peek() {
    return this.#tokens[this.#position];
  }
}

function tokenize(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let position = 0;

  while (position < query.length) {
    const character = query[position]!;
    if (/\s/u.test(character)) {
      position += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push({ type: character === "(" ? "left-parenthesis" : "right-parenthesis" });
      position += 1;
      continue;
    }

    const start = position;
    let quote: '"' | null = null;
    let regularExpression = false;
    let escaped = false;
    while (position < query.length) {
      const next = query[position]!;
      if (escaped) {
        escaped = false;
        position += 1;
        continue;
      }
      if (next === "\\" && (quote || regularExpression)) {
        escaped = true;
        position += 1;
        continue;
      }
      if (next === '"') {
        quote = quote ? null : '"';
        position += 1;
        continue;
      }
      if (!quote && next === "/") {
        const prefix = query.slice(start, position);
        if (regularExpression || /^[a-z][a-z0-9_-]*:$/iu.test(prefix)) {
          regularExpression = !regularExpression;
          position += 1;
          continue;
        }
      }
      if (!quote && !regularExpression && (/\s/u.test(next) || next === "(" || next === ")")) {
        break;
      }
      position += 1;
    }
    if (quote) {
      throw new SearchSyntaxError("Close the quoted phrase in the Scryfall query.");
    }
    if (regularExpression) {
      throw new SearchSyntaxError("Close the regular expression in the Scryfall query.");
    }

    const raw = query.slice(start, position);
    if (raw === "-" || /[\p{L}\p{N}!]/u.test(raw)) {
      tokens.push(raw.toLowerCase() === "or" ? { type: "or" } : { raw, type: "term" });
    }
  }

  return tokens;
}

function compileNode(node: SearchNode, visibility: SpoilerVisibilitySnapshot): SqlFragment {
  if (node.type === "term") return compileTerm(node.raw, visibility);
  if (node.type === "not") {
    const child = compileNode(node.child, visibility);
    return { parameters: child.parameters, sql: `NOT (${child.sql})` };
  }

  const children = node.children.map((child) => compileNode(child, visibility));
  return {
    parameters: children.flatMap((child) => child.parameters),
    sql: children.map((child) => `(${child.sql})`).join(node.type === "and" ? " AND " : " OR "),
  };
}

function compileTerm(raw: string, visibility: SpoilerVisibilitySnapshot): SqlFragment {
  if (raw.startsWith("!")) {
    const name = decodeValue(raw.slice(1));
    if (!name) throw new SearchSyntaxError("Add a card name after the exclamation mark.");
    return { parameters: [name], sql: "cards.name = ? COLLATE NOCASE" };
  }

  const match = /^([a-z][a-z0-9_-]*)(:|!=|<=|>=|=|<|>)(.*)$/iu.exec(raw);
  if (!match) return compileFtsText(decodeValue(raw), undefined, isQuoted(raw));

  const field = match[1]!.toLowerCase();
  const matchedComparison = match[2]!;
  if (!isComparison(matchedComparison)) {
    throw new SearchSyntaxError("The Scryfall comparison is not valid.");
  }
  let comparison = matchedComparison;
  let encodedValue = match[3]!;
  const comparisonInValue = /^(<=|>=|!=|=|<|>)(.+)$/u.exec(encodedValue);
  if (comparison === ":" && comparisonInValue) {
    const valueComparison = comparisonInValue[1]!;
    if (!isComparison(valueComparison)) {
      throw new SearchSyntaxError("The Scryfall comparison is not valid.");
    }
    comparison = valueComparison;
    encodedValue = comparisonInValue[2]!;
  }
  const quoted = isQuoted(encodedValue);
  const value = decodeValue(encodedValue);
  if (!value) throw new SearchSyntaxError(`Add a value after "${field}${comparison}".`);
  if (value.startsWith("/") && value.endsWith("/")) {
    throw new SearchSyntaxError(
      "Regular expression searches are not supported in the local catalog.",
    );
  }

  switch (field) {
    case "name":
    case "n":
      return comparison === "="
        ? { parameters: [value], sql: "cards.name = ? COLLATE NOCASE" }
        : comparison === "!="
          ? { parameters: [value], sql: "cards.name <> ? COLLATE NOCASE" }
          : requireTextComparison(field, comparison, compileFtsText(value, "name", quoted));
    case "type":
    case "t":
      return requireTextComparison(field, comparison, compileFtsText(value, "type_line", quoted));
    case "oracle":
    case "o":
    case "fulloracle":
    case "fo":
      return requireTextComparison(field, comparison, compileJsonText(value, oracleTextSql));
    case "keyword":
    case "kw":
      return requireEquality(field, comparison, compileArrayValue("$.keywords", value));
    case "mana":
    case "m":
      return requireTextComparison(
        field,
        comparison,
        compileJsonText(normalizeManaCost(value), manaCostSql),
      );
    case "color":
    case "c":
      return compileColor("$.colors", value, comparison);
    case "identity":
    case "id":
    case "ci":
      return compileColor("$.color_identity", value, comparison);
    case "commander":
      return compileColor("$.color_identity", value, comparison === ":" ? "<=" : comparison);
    case "manavalue":
    case "mv":
    case "cmc":
      return compileNumericJsonField("$.cmc", value, comparison, field);
    case "power":
    case "pow":
      return compileStat("power", value, comparison, field);
    case "toughness":
    case "tou":
      return compileStat("toughness", value, comparison, field);
    case "loyalty":
    case "loy":
      return compileStat("loyalty", value, comparison, field);
    case "defense":
    case "def":
      return compileStat("defense", value, comparison, field);
    case "pt":
    case "powtou":
      return compilePowerToughness(value, comparison, field);
    case "rarity":
    case "r":
      return compileRarity(value, comparison);
    case "set":
    case "s":
    case "edition":
    case "e":
      return requireEquality(field, comparison, {
        parameters: [value, value],
        sql: "(cards.set_code = ? COLLATE NOCASE OR cards.set_name = ? COLLATE NOCASE)",
      });
    case "settype":
    case "st":
      return requireEquality(field, comparison, {
        parameters: [value],
        sql: `EXISTS (
          SELECT 1 FROM sets
          WHERE sets.id = cards.set_id AND sets.set_type = ? COLLATE NOCASE
        )`,
      });
    case "block":
    case "b":
      return requireEquality(field, comparison, {
        parameters: [value, value],
        sql: `EXISTS (
          SELECT 1 FROM sets
          WHERE sets.id = cards.root_set_id
            AND (sets.code = ? COLLATE NOCASE OR sets.name = ? COLLATE NOCASE)
        )`,
      });
    case "number":
    case "cn":
      return compileCollectorNumber(value, comparison);
    case "format":
    case "f":
    case "legal":
    case "legality":
      return requireEquality(field, comparison, compileLegality(value, ["legal", "restricted"]));
    case "banned":
      return requireEquality(field, comparison, compileLegality(value, ["banned"]));
    case "restricted":
      return requireEquality(field, comparison, compileLegality(value, ["restricted"]));
    case "language":
    case "lang":
      return requireEquality(
        field,
        comparison,
        value.toLowerCase() === "any"
          ? { parameters: [], sql: "json_type(cards.json, '$.lang') = 'text'" }
          : compileJsonScalar("$.lang", value),
      );
    case "game":
      return requireEquality(field, comparison, compileArrayValue("$.games", value));
    case "finish":
      return requireEquality(field, comparison, compileArrayValue("$.finishes", value));
    case "artist":
    case "a":
      return requireTextComparison(field, comparison, compileJsonText(value, artistTextSql));
    case "flavor":
    case "ft":
      return requireTextComparison(field, comparison, compileJsonText(value, flavorTextSql));
    case "watermark":
    case "wm":
      return requireEquality(field, comparison, compileJsonScalar("$.watermark", value));
    case "date":
      return compileDate(value, comparison);
    case "year":
      return compileYear(value, comparison);
    case "layout":
      return requireEquality(field, comparison, compileJsonScalar("$.layout", value));
    case "frame":
      return requireEquality(
        field,
        comparison,
        /^(?:1993|1997|2003|2015|future)$/u.test(value)
          ? compileJsonScalar("$.frame", value)
          : compileArrayValue("$.frame_effects", value),
      );
    case "border":
      return requireEquality(field, comparison, compileJsonScalar("$.border_color", value));
    case "stamp":
      return requireEquality(field, comparison, compileJsonScalar("$.security_stamp", value));
    case "usd":
    case "eur":
    case "tix":
    case "usd_foil":
    case "usd_etched":
    case "eur_foil":
      return compilePrice(field, value, comparison);
    case "prints":
    case "sets":
    case "paperprints":
    case "papersets":
      return compilePrintCount(field, value, comparison, visibility);
    case "is":
      return requireEquality(field, comparison, compileIs(value, visibility));
    case "not": {
      const fragment = cardTypeWords.has(value.toLowerCase())
        ? compileFtsText(value, "type_line")
        : compileIs(value, visibility);
      return requireEquality(field, comparison, {
        parameters: fragment.parameters,
        sql: `NOT (${fragment.sql})`,
      });
    }
    case "has":
      return requireEquality(field, comparison, compileHas(value));
    case "in":
      return requireEquality(
        field,
        comparison,
        ["arena", "mtgo", "paper"].includes(value.toLowerCase())
          ? compileArrayValue("$.games", value)
          : compileEverPrintedIn(value, visibility),
      );
    default:
      throw new SearchSyntaxError(`The local catalog does not support the "${field}" operator.`);
  }
}

function compileFtsText(value: string, column?: string, phrase = false): SqlFragment {
  const terms = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length === 0) {
    return { parameters: [], sql: "0" };
  }
  const prefix = column ? `${column} : ` : "";
  const ftsQuery = phrase
    ? `${prefix}"${terms.join(" ").replaceAll('"', '""')}"*`
    : terms.map((term) => `${prefix}"${term.replaceAll('"', '""')}"*`).join(" AND ");
  return {
    parameters: [ftsQuery],
    sql: `cards.rowid IN (
      SELECT rowid FROM card_search WHERE card_search MATCH ?
    )`,
  };
}

const oracleTextSql = `(
  COALESCE(json_extract(cards.json, '$.oracle_text'), '') || ' ' ||
  COALESCE((
    SELECT group_concat(COALESCE(json_extract(face.value, '$.oracle_text'), ''), ' ')
    FROM json_each(cards.json, '${cardFacesPath}') AS face
  ), '')
)`;
const manaCostSql = `(
  COALESCE(json_extract(cards.json, '$.mana_cost'), '') || ' ' ||
  COALESCE((
    SELECT group_concat(COALESCE(json_extract(face.value, '$.mana_cost'), ''), ' ')
    FROM json_each(cards.json, '${cardFacesPath}') AS face
  ), '')
)`;
const artistTextSql = `(
  COALESCE(json_extract(cards.json, '$.artist'), '') || ' ' ||
  COALESCE((
    SELECT group_concat(COALESCE(json_extract(face.value, '$.artist'), ''), ' ')
    FROM json_each(cards.json, '${cardFacesPath}') AS face
  ), '')
)`;
const flavorTextSql = `(
  COALESCE(json_extract(cards.json, '$.flavor_text'), '') || ' ' ||
  COALESCE((
    SELECT group_concat(COALESCE(json_extract(face.value, '$.flavor_text'), ''), ' ')
    FROM json_each(cards.json, '${cardFacesPath}') AS face
  ), '')
)`;

function compileJsonText(value: string, expression: string): SqlFragment {
  if (value.includes("~")) {
    return {
      parameters: [value],
      sql: `instr(lower(${expression}), replace(lower(?), '~', lower(cards.name))) > 0`,
    };
  }
  return { parameters: [value], sql: `instr(lower(${expression}), lower(?)) > 0` };
}

function compileJsonScalar(path: string, value: string): SqlFragment {
  return {
    parameters: [value],
    sql: `COALESCE(json_extract(cards.json, '${path}'), '') = ? COLLATE NOCASE`,
  };
}

function compileArrayValue(path: string, value: string): SqlFragment {
  return {
    parameters: [value],
    sql: `EXISTS (
      SELECT 1 FROM json_each(cards.json, '${path}') AS item
      WHERE item.value = ? COLLATE NOCASE
    )`,
  };
}

function compileColor(path: string, value: string, comparison: Comparison): SqlFragment {
  const normalized = value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  if (normalized === "multicolor" || normalized === "multicolored") {
    return compareColorCount(path, 1, comparison === ":" ? ">" : comparison);
  }
  if (normalized === "monocolor" || normalized === "monocolored") {
    return compareColorCount(path, 1, comparison === ":" ? "=" : comparison);
  }
  if (/^\d+$/u.test(normalized)) {
    return compareColorCount(path, Number(normalized), comparison === ":" ? "=" : comparison);
  }

  const named = colorNames.get(normalized);
  const letters = named ?? normalized.toUpperCase();
  if (!/^[WUBRG]*$/u.test(letters)) {
    throw new SearchSyntaxError(`"${value}" is not a recognized Magic color combination.`);
  }
  const colors = [...new Set(letters.split(""))].sort(
    (left, right) => colorOrder.indexOf(left) - colorOrder.indexOf(right),
  );
  const countSql = `COALESCE(json_array_length(json_extract(cards.json, '${path}')), 0)`;
  const containsAllSql = `NOT EXISTS (
    SELECT 1 FROM json_each(?) AS requested
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(cards.json, '${path}') AS actual
      WHERE upper(actual.value) = requested.value
    )
  )`;
  const isSubsetSql = `NOT EXISTS (
    SELECT 1 FROM json_each(cards.json, '${path}') AS actual
    WHERE upper(actual.value) NOT IN (SELECT value FROM json_each(?))
  )`;
  const encodedColors = JSON.stringify(colors);

  switch (comparison) {
    case ":":
    case "=":
      return {
        parameters: [encodedColors],
        sql: `(${countSql} = ${colors.length} AND ${containsAllSql})`,
      };
    case "!=": {
      const exact = compileColor(path, value, "=");
      return { parameters: exact.parameters, sql: `NOT (${exact.sql})` };
    }
    case ">=":
      return { parameters: [encodedColors], sql: containsAllSql };
    case ">":
      return {
        parameters: [encodedColors],
        sql: `(${countSql} > ${colors.length} AND ${containsAllSql})`,
      };
    case "<=":
      return { parameters: [encodedColors], sql: isSubsetSql };
    case "<":
      return {
        parameters: [encodedColors],
        sql: `(${countSql} < ${colors.length} AND ${isSubsetSql})`,
      };
  }
}

function compareColorCount(path: string, count: number, comparison: Comparison): SqlFragment {
  const operator = sqlComparison(comparison);
  return {
    parameters: [count],
    sql: `COALESCE(json_array_length(json_extract(cards.json, '${path}')), 0) ${operator} ?`,
  };
}

function compileNumericJsonField(
  path: string,
  value: string,
  comparison: Comparison,
  field: string,
): SqlFragment {
  const number = parseNumber(value, field);
  return {
    parameters: [number],
    sql: `CAST(json_extract(cards.json, '${path}') AS REAL) ${sqlComparison(comparison)} ?`,
  };
}

function compileStat(
  stat: "defense" | "loyalty" | "power" | "toughness",
  value: string,
  comparison: Comparison,
  field: string,
): SqlFragment {
  const path = `$.${stat}`;
  const numeric = /^-?\d+(?:\.\d+)?$/u.test(value);
  const operator = numeric ? sqlComparison(comparison) : sqlComparisonForText(comparison, field);
  const parameter = numeric ? Number(value) : value;
  const cast = numeric ? "CAST" : "lower";
  const suffix = numeric ? " AS REAL)" : ")";
  const rootValue = `${cast}(json_extract(cards.json, '${path}')${suffix}`;
  const faceValue = `${cast}(json_extract(face.value, '${path}')${suffix}`;
  return {
    parameters: [parameter, parameter],
    sql: `(
      ${rootValue} ${operator} ? OR EXISTS (
        SELECT 1 FROM json_each(cards.json, '${cardFacesPath}') AS face
        WHERE ${faceValue} ${operator} ?
      )
    )`,
  };
}

function compilePowerToughness(value: string, comparison: Comparison, field: string): SqlFragment {
  const [power, toughness, remainder] = value.split("/");
  if (!power || !toughness || remainder !== undefined) {
    throw new SearchSyntaxError(`The "${field}" operator needs a value such as 3/3.`);
  }
  const powerFragment = compileStat("power", power, comparison, field);
  const toughnessFragment = compileStat("toughness", toughness, comparison, field);
  return {
    parameters: [...powerFragment.parameters, ...toughnessFragment.parameters],
    sql: `(${powerFragment.sql}) AND (${toughnessFragment.sql})`,
  };
}

function compileRarity(value: string, comparison: Comparison): SqlFragment {
  const normalized = value.toLowerCase();
  const index = rarityOrder.findIndex((rarity) => rarity === normalized);
  if (index < 0) throw new SearchSyntaxError(`"${value}" is not a recognized card rarity.`);
  if (comparison === ":" || comparison === "=" || comparison === "!=") {
    return {
      parameters: [rarityOrder[index]!],
      sql: `cards.rarity ${comparison === "!=" ? "<>" : "="} ? COLLATE NOCASE`,
    };
  }
  const rarityCase = `CASE lower(cards.rarity)
    ${rarityOrder.map((rarity, position) => `WHEN '${rarity}' THEN ${position}`).join(" ")}
    ELSE -1 END`;
  return { parameters: [index], sql: `${rarityCase} ${sqlComparison(comparison)} ?` };
}

function compileCollectorNumber(value: string, comparison: Comparison): SqlFragment {
  if (comparison === ":" || comparison === "=" || comparison === "!=") {
    return {
      parameters: [value],
      sql: `cards.collector_number ${comparison === "!=" ? "<>" : "="} ? COLLATE NOCASE`,
    };
  }
  const number = parseNumber(value, "collector number");
  return {
    parameters: [number],
    sql: `CAST(cards.collector_number AS REAL) ${sqlComparison(comparison)} ?`,
  };
}

function compileLegality(format: string, statuses: readonly string[]): SqlFragment {
  if (!/^[a-z0-9_]+$/iu.test(format)) {
    throw new SearchSyntaxError(`"${format}" is not a valid format name.`);
  }
  return {
    parameters: [`$.legalities.${format.toLowerCase()}`, ...statuses],
    sql: `json_extract(cards.json, ?) IN (${statuses.map(() => "?").join(", ")})`,
  };
}

function compileDate(value: string, comparison: Comparison): SqlFragment {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u.test(value)) {
    throw new SearchSyntaxError("Dates must use YYYY, YYYY-MM, or YYYY-MM-DD.");
  }
  const operator = sqlComparison(comparison);
  if (comparison === ":" || comparison === "=" || comparison === "!=") {
    return {
      parameters: [`${value}%`],
      sql: `COALESCE(cards.released_at, '') ${comparison === "!=" ? "NOT LIKE" : "LIKE"} ?`,
    };
  }
  return { parameters: [value], sql: `COALESCE(cards.released_at, '') ${operator} ?` };
}

function compileYear(value: string, comparison: Comparison): SqlFragment {
  if (!/^\d{4}$/u.test(value)) throw new SearchSyntaxError("Years must use four digits.");
  return {
    parameters: [Number(value)],
    sql: `CAST(substr(COALESCE(cards.released_at, ''), 1, 4) AS INTEGER) ${sqlComparison(comparison)} ?`,
  };
}

function compilePrice(field: string, value: string, comparison: Comparison): SqlFragment {
  const price = parseNumber(value, field);
  return {
    parameters: [price],
    sql: `CAST(json_extract(cards.json, '$.prices.${field}') AS REAL) ${sqlComparison(comparison)} ?`,
  };
}

function compilePrintCount(
  field: string,
  value: string,
  comparison: Comparison,
  visibility: SpoilerVisibilitySnapshot,
): SqlFragment {
  const count = parseNumber(value, field);
  const paperOnly = field.startsWith("paper")
    ? "AND COALESCE(json_extract(sibling.json, '$.digital'), 0) = 0"
    : "";
  const distinct = field.endsWith("sets") ? "DISTINCT sibling.set_id" : "sibling.id";
  return {
    parameters: [...catalogVisibilityArguments(visibility), count],
    sql: `(SELECT COUNT(${distinct})
      FROM cards AS sibling
      WHERE sibling.identity_id = cards.identity_id
        ${paperOnly}
        AND ${catalogVisibilitySqlFor("sibling")}
    ) ${sqlComparison(comparison)} ?`,
  };
}

function compileIs(value: string, visibility: SpoilerVisibilitySnapshot): SqlFragment {
  switch (value.toLowerCase()) {
    case "digital":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.digital'), 0) = 1" };
    case "paper":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.digital'), 0) = 0" };
    case "promo":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.promo'), 0) = 1" };
    case "foil":
      return compileArrayValue("$.finishes", "foil");
    case "nonfoil":
      return compileArrayValue("$.finishes", "nonfoil");
    case "etched":
      return compileArrayValue("$.finishes", "etched");
    case "glossy":
      return compileArrayValue("$.finishes", "glossy");
    case "hybrid":
      return { parameters: [], sql: `instr(${manaCostSql}, '/') > 0` };
    case "phyrexian":
      return { parameters: [], sql: `instr(upper(${manaCostSql}), '/P}') > 0` };
    case "split":
    case "flip":
    case "meld":
    case "transform":
      return compileJsonScalar("$.layout", value);
    case "mdfc":
      return compileJsonScalar("$.layout", "modal_dfc");
    case "dfc":
      return {
        parameters: [],
        sql: `COALESCE(json_extract(cards.json, '$.layout'), '') IN (
          'double_faced_token', 'meld', 'modal_dfc', 'reversible_card', 'transform'
        )`,
      };
    case "leveler":
      return compileJsonScalar("$.layout", "leveler");
    case "token":
      return {
        parameters: [],
        sql: "COALESCE(json_extract(cards.json, '$.layout'), '') IN ('token', 'double_faced_token')",
      };
    case "funny":
      return {
        parameters: [],
        sql: `EXISTS (SELECT 1 FROM sets WHERE sets.id = cards.set_id AND sets.set_type = 'funny')`,
      };
    case "fullart":
    case "full":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.full_art'), 0) = 1" };
    case "textless":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.textless'), 0) = 1" };
    case "reserved":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.reserved'), 0) = 1" };
    case "reprint":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.reprint'), 0) = 1" };
    case "firstprint":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.reprint'), 0) = 0" };
    case "unique":
      return {
        parameters: [...catalogVisibilityArguments(visibility)],
        sql: `(SELECT COUNT(*)
          FROM cards AS sibling
          WHERE sibling.identity_id = cards.identity_id
            AND ${catalogVisibilitySqlFor("sibling")}
        ) = 1`,
      };
    case "permanent":
      return {
        parameters: [],
        sql: "cards.type_line NOT LIKE '%Instant%' AND cards.type_line NOT LIKE '%Sorcery%'",
      };
    case "spell":
      return { parameters: [], sql: "cards.type_line NOT LIKE '%Land%'" };
    case "vanilla":
      return {
        parameters: [],
        sql: `cards.type_line LIKE '%Creature%'
          AND trim(${oracleTextSql}) = ''`,
      };
    case "modal":
      return { parameters: [], sql: `instr(lower(${oracleTextSql}), 'choose ') > 0` };
    case "historic":
      return {
        parameters: [],
        sql: `(cards.type_line LIKE '%Artifact%'
          OR cards.type_line LIKE '%Legendary%'
          OR cards.type_line LIKE '%Saga%')`,
      };
    case "party":
      return {
        parameters: [],
        sql: `(cards.type_line LIKE '%Cleric%'
          OR cards.type_line LIKE '%Rogue%'
          OR cards.type_line LIKE '%Warrior%'
          OR cards.type_line LIKE '%Wizard%')`,
      };
    case "commander":
      return {
        parameters: [],
        sql: `(
          cards.type_line LIKE '%Legendary Creature%'
          OR instr(lower(${oracleTextSql}), 'can be your commander') > 0
        )`,
      };
    case "companion":
      return compileArrayValue("$.keywords", "Companion");
    case "universesbeyond":
      return compileArrayValue("$.promo_types", "universesbeyond");
    case "booster":
      return { parameters: [], sql: "COALESCE(json_extract(cards.json, '$.booster'), 0) = 1" };
    case "hires":
      return {
        parameters: [],
        sql: "COALESCE(json_extract(cards.json, '$.highres_image'), 0) = 1",
      };
    case "fnm":
    case "prerelease":
    case "release":
    case "scryfallpreview":
    case "spotlight":
      return compileArrayValue("$.promo_types", value);
    default:
      throw new SearchSyntaxError(`The local catalog does not support "is:${value}".`);
  }
}

function compileHas(value: string): SqlFragment {
  const paths = new Map([
    ["flavor", "$.flavor_text"],
    ["indicator", "$.color_indicator"],
    ["watermark", "$.watermark"],
  ]);
  const path = paths.get(value.toLowerCase());
  if (!path) throw new SearchSyntaxError(`The local catalog does not support "has:${value}".`);
  return {
    parameters: [],
    sql: `json_type(cards.json, '${path}') IS NOT NULL`,
  };
}

function compileEverPrintedIn(value: string, visibility: SpoilerVisibilitySnapshot): SqlFragment {
  const normalized = value.toLowerCase();
  const rarity = rarityOrder.some((candidate) => candidate === normalized);
  const valueParameters = rarity ? [normalized] : [normalized, normalized];
  return {
    parameters: [...valueParameters, ...catalogVisibilityArguments(visibility)],
    sql: `EXISTS (
      SELECT 1 FROM cards AS sibling
      WHERE sibling.identity_id = cards.identity_id
        AND ${
          rarity
            ? "sibling.rarity = ? COLLATE NOCASE"
            : `(sibling.set_code = ? COLLATE NOCASE
              OR COALESCE(json_extract(sibling.json, '$.lang'), '') = ? COLLATE NOCASE)`
        }
        AND ${catalogVisibilitySqlFor("sibling")}
    )`,
  };
}

function requireEquality(
  field: string,
  comparison: Comparison,
  fragment: SqlFragment,
): SqlFragment {
  if (comparison === ":" || comparison === "=") return fragment;
  if (comparison === "!=") {
    return { parameters: fragment.parameters, sql: `NOT (${fragment.sql})` };
  }
  throw new SearchSyntaxError(`The "${field}" operator only supports exact matches.`);
}

function requireTextComparison(
  field: string,
  comparison: Comparison,
  fragment: SqlFragment,
): SqlFragment {
  return requireEquality(field, comparison, fragment);
}

function sqlComparison(comparison: Comparison): "<" | "<=" | "=" | "<>" | ">" | ">=" {
  if (comparison === ":") return "=";
  if (comparison === "!=") return "<>";
  return comparison;
}

function isComparison(value: string): value is Comparison {
  return [":", "=", "!=", "<", "<=", ">", ">="].includes(value);
}

function sqlComparisonForText(comparison: Comparison, field: string) {
  if (comparison === ":" || comparison === "=") return "=";
  if (comparison === "!=") return "<>";
  throw new SearchSyntaxError(`The "${field}" operator needs a numeric value for comparisons.`);
}

function parseNumber(value: string, field: string) {
  if (!/^-?\d+(?:\.\d+)?$/u.test(value)) {
    throw new SearchSyntaxError(`The "${field}" operator needs a number.`);
  }
  return Number(value);
}

function normalizeManaCost(value: string) {
  const compact = value.replaceAll(/\s/gu, "").toUpperCase();
  if (compact.includes("{")) return compact;
  const symbols = compact.match(/\d+|[WUBRGXCS]/gu);
  return symbols?.join("") === compact ? symbols.map((symbol) => `{${symbol}}`).join("") : compact;
}

function decodeValue(value: string) {
  if (value.startsWith('"') || value.endsWith('"')) {
    if (!(value.startsWith('"') && value.endsWith('"') && value.length >= 2)) {
      throw new SearchSyntaxError("Close the quoted phrase in the Scryfall query.");
    }
    return value.slice(1, -1).replaceAll(/\\(["\\])/gu, "$1");
  }
  return value;
}

function isQuoted(value: string) {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2;
}
