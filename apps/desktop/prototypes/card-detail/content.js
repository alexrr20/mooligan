export const printings = [
  { code: "FDN", name: "Foundations", number: "191", year: "2024", finish: "Foil" },
  { code: "CLB", name: "Commander Legends", number: "187", year: "2022", finish: "Etched" },
  { code: "2X2", name: "Double Masters", number: "117", year: "2022", finish: "Foil" },
  { code: "STA", name: "Mystical Archive", number: "42", year: "2021", finish: "Showcase" },
  { code: "M11", name: "Magic 2011", number: "149", year: "2010", finish: "Selected" },
  { code: "P3K", name: "Portal Three Kingdoms", number: "115", year: "1999", finish: "Rare" },
  { code: "4ED", name: "Fourth Edition", number: "208", year: "1995", finish: "White border" },
  {
    code: "LEA",
    name: "Limited Edition Alpha",
    number: "161",
    year: "1993",
    finish: "First print",
  },
];

export function cardVisual(modifier = "") {
  return `
    <figure class="card-visual ${modifier}" data-card-visual>
      <div class="card-frame">
        <header class="card-nameplate">
          <strong>Lightning Bolt</strong>
          <span class="mana-red" aria-label="One red mana">R</span>
        </header>
        <div class="card-art" role="img" aria-label="A bright fork of lightning splitting a dark red sky">
          <svg viewBox="0 0 600 430" aria-hidden="true">
            <defs>
              <linearGradient id="storm" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#090806" />
                <stop offset=".5" stop-color="#4d160d" />
                <stop offset="1" stop-color="#b74b1c" />
              </linearGradient>
              <linearGradient id="flash" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#fffbd8" />
                <stop offset=".5" stop-color="#ffd35d" />
                <stop offset="1" stop-color="#f06421" />
              </linearGradient>
              <filter id="glow"><feGaussianBlur stdDeviation="12" /></filter>
            </defs>
            <rect width="600" height="430" fill="url(#storm)" />
            <circle cx="390" cy="162" r="130" fill="#ef6425" opacity=".18" filter="url(#glow)" />
            <path d="M392 -20 298 173l76-18-121 250 212-282-86 25L486-20Z" fill="#fff7be" opacity=".2" filter="url(#glow)" />
            <path d="M392 -20 298 173l76-18-121 250 212-282-86 25L486-20Z" fill="url(#flash)" />
            <path d="M319 96 225 241l57-15-85 162 150-185-55 14 83-121Z" fill="#ffd85f" opacity=".72" />
            <path d="M0 336c92-54 184-43 276-1s201 38 324-29v124H0Z" fill="#110b08" opacity=".74" />
            <g fill="none" stroke="#ffc750" stroke-width="3" opacity=".42">
              <path d="M92 58 36 118m94-33-33 84M530 73l-63 59m96 10-69 45" />
            </g>
          </svg>
          <span class="art-credit">Mooligan study · 2026</span>
        </div>
        <div class="card-type"><strong>Instant</strong><span>◆</span></div>
        <div class="card-rules">
          <p>Lightning Bolt deals 3 damage to any target.</p>
          <blockquote>“The sparkmage shrieked, calling on the rage of the storms.”</blockquote>
        </div>
        <footer class="card-footer"><span>149 / 249 · C</span><span>M11 · EN</span></footer>
      </div>
      <button class="card-zoom" data-zoom type="button">Inspect artwork <span aria-hidden="true">↗</span></button>
    </figure>
  `;
}

export function dock(active = "search") {
  const items = [
    ["home", "⌂", "Home"],
    ["collection", "▣", "Collection"],
    ["decks", "◇", "Decks"],
    ["sets", "⊞", "Sets"],
    ["lists", "≡", "Lists"],
    ["search", "⌕", "Search"],
    ["settings", "⌁", "Settings"],
  ];

  return `
    <nav class="app-dock" aria-label="Prototype application navigation">
      ${items
        .map(
          ([id, icon, label]) => `
            <a class="dock-item ${id === active ? "is-active" : ""}" href="#prototype-card" aria-label="${label}" title="${label}">
              <span aria-hidden="true">${icon}</span>
            </a>`,
        )
        .join("")}
    </nav>
  `;
}

export function printingCards(limit = printings.length, compact = false) {
  return printings
    .slice(0, limit)
    .map(
      (printing, index) => `
        <button class="printing-card ${compact ? "is-compact" : ""} ${index === 4 ? "is-selected" : ""}" data-printing="${printing.code}" data-edition-name="${printing.name}" type="button">
          <span class="printing-art art-${index % 4}" aria-hidden="true"><i></i></span>
          <span class="printing-copy">
            <strong>${printing.name}</strong>
            <small>${printing.code} · #${printing.number} · ${printing.year}</small>
            <em>${printing.finish}</em>
          </span>
        </button>`,
    )
    .join("");
}

export function quantityControl() {
  return `
    <div class="quantity-control" aria-label="Owned quantity">
      <button data-quantity-step="-1" type="button" aria-label="Remove one copy">−</button>
      <output data-quantity>2</output>
      <button data-quantity-step="1" type="button" aria-label="Add one copy">+</button>
    </div>
  `;
}

export function zoomDialog() {
  return `
    <dialog class="art-dialog" data-art-dialog>
      <form method="dialog">
        <button class="dialog-close" aria-label="Close artwork" type="submit">×</button>
        ${cardVisual("is-dialog")}
      </form>
    </dialog>
  `;
}
