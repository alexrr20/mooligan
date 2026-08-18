import { cardVisual, dock, printingCards, zoomDialog } from "../content.js";

export function renderCodex() {
  return `
    <div class="prototype-shell codex proto-enter" id="prototype-card">
      <div class="window-bar"><span>Mooligan / Field Codex</span><span>Catalog entry 004,981</span></div>
      <article class="codex-page">
        <header class="codex-topline">
          <button class="back-link" data-back type="button"><span aria-hidden="true">←</span> Search results</button>
          <div class="codex-actions"><button data-favorite aria-pressed="false" type="button">Save to field notes <span aria-hidden="true">☆</span></button><span>Offline edition</span></div>
        </header>

        <div class="codex-hero">
          <aside class="codex-card-column">
            <span class="plate-number">PLATE 149</span>
            ${cardVisual()}
            <p class="image-caption"><strong data-edition>Magic 2011</strong><span>Christopher Moeller, illustrator</span></p>
          </aside>
          <section class="codex-story" aria-labelledby="codex-title">
            <p class="chapter-mark">I / Red instant</p>
            <h1 id="codex-title" aria-label="Lightning Bolt">Lightning<br />Bolt</h1>
            <div class="codex-rule"><span class="mana-cost"><i>R</i></span><p>Lightning Bolt deals <strong>3 damage</strong> to any target.</p></div>
            <blockquote>“The sparkmage shrieked, calling on the rage of the storms.”</blockquote>
            <dl class="codex-facts"><div><dt>Mana value</dt><dd>One</dd></div><div><dt>Color identity</dt><dd>Red</dd></div><div><dt>Introduced</dt><dd>1993</dd></div><div><dt>Printings</dt><dd>91</dd></div></dl>
          </section>
        </div>

        <section class="codex-ledger" aria-labelledby="codex-ledger-title">
          <header><div><p class="chapter-mark">II / The selected object</p><h2 id="codex-ledger-title">Printing ledger</h2></div><span>M11 · English · Nonfoil</span></header>
          <dl><div><dt>Edition</dt><dd>Magic 2011</dd></div><div><dt>Collector number</dt><dd>149 / 249</dd></div><div><dt>Rarity</dt><dd>Common</dd></div><div><dt>Release</dt><dd>16 July 2010</dd></div><div><dt>Artist</dt><dd>Christopher Moeller</dd></div><div><dt>Available finishes</dt><dd>Nonfoil, foil</dd></div></dl>
        </section>

        <section class="codex-editions" aria-labelledby="codex-editions-title">
          <header><div><p class="chapter-mark">III / Material history</p><h2 id="codex-editions-title">Eight notable printings</h2></div><p>Select a printing to update the plate.</p></header>
          <div class="codex-printings">${printingCards()}</div>
        </section>

        <section class="codex-legality" aria-label="Format legality">
          <p class="chapter-mark">IV / Permission</p>
          <div><strong>Modern</strong><span>Legal</span><strong>Legacy</strong><span>Legal</span><strong>Commander</strong><span>Legal</span><strong>Pauper</strong><span>Legal</span><strong>Standard</strong><em>Not legal</em></div>
        </section>
      </article>
      ${dock()}
      ${zoomDialog()}
      <div class="prototype-toast" data-toast role="status" aria-live="polite"></div>
    </div>
  `;
}
