import { cardVisual, dock, printingCards, quantityControl, zoomDialog } from "../content.js";

export function renderCenterfold() {
  return `
    <div class="prototype-shell centerfold proto-enter" id="prototype-card">
      <div class="window-bar"><span>Mooligan / Card record</span><span>Local catalog · Offline ready</span></div>
      <article class="centerfold-page">
        <header class="centerfold-topline">
          <button class="back-link" data-back type="button"><span aria-hidden="true">←</span> Back to results</button>
          <button class="centerfold-pin" data-favorite aria-pressed="false" type="button">Pin card <span aria-hidden="true">☆</span></button>
        </header>

        <section class="centerfold-hero" aria-label="Selected card artwork">
          <p class="centerfold-kicker">Selected printing · M11 149</p>
          <div class="centerfold-art">${cardVisual()}</div>
          <p class="centerfold-caption"><span data-edition>Magic 2011</span><span>English · Nonfoil</span></p>
        </section>

        <header class="centerfold-identity">
          <p class="eyebrow">Card record 01 / 04</p>
          <div><h1>Lightning Bolt</h1><span class="mana-cost"><i>R</i></span></div>
          <p>Instant</p>
        </header>

        <div class="centerfold-flow">
          <section class="centerfold-oracle" aria-labelledby="centerfold-oracle-title">
            <header><p class="centerfold-index">01</p><div><p class="section-label">Oracle text</p><h2 id="centerfold-oracle-title">What the card does</h2></div></header>
            <p class="centerfold-rule">Lightning Bolt deals <strong>3 damage</strong> to any target.</p>
            <dl class="centerfold-facts"><div><dt>Mana value</dt><dd>1</dd></div><div><dt>Color identity</dt><dd>Red</dd></div><div><dt>Keywords</dt><dd>None</dd></div></dl>
          </section>

          <section class="centerfold-workspace" aria-labelledby="centerfold-workspace-title">
            <header><p class="centerfold-index">02</p><div><p class="section-label">Your workspace</p><h2 id="centerfold-workspace-title">Keep this card close</h2></div></header>
            <div class="centerfold-action-grid">
              <div class="centerfold-owned"><span>Owned copies</span>${quantityControl()}<small>1 foil · 1 nonfoil</small></div>
              <button class="primary-action" data-collect aria-pressed="true" type="button"><span>In collection</span><b>✓</b></button>
              <label class="deck-field">Add to deck<select data-deck><option>Choose a deck…</option><option>Izzet Prowess</option><option>Burn / Modern</option><option>Cube 540</option></select></label>
            </div>
          </section>

          <section class="centerfold-printing" aria-labelledby="centerfold-printing-title">
            <header><p class="centerfold-index">03</p><div><p class="section-label">Selected object</p><h2 id="centerfold-printing-title">Printing details</h2></div></header>
            <dl class="centerfold-metadata"><div><dt>Edition</dt><dd data-edition>Magic 2011</dd></div><div><dt>Set code</dt><dd>M11</dd></div><div><dt>Collector number</dt><dd>149 / 249</dd></div><div><dt>Rarity</dt><dd>Common</dd></div><div><dt>Released</dt><dd>16 July 2010</dd></div><div><dt>Artist</dt><dd>Christopher Moeller</dd></div><div><dt>Language</dt><dd>English</dd></div><div><dt>Finishes</dt><dd>Nonfoil · Foil</dd></div></dl>
            <div class="centerfold-legality"><p class="section-label">Format legality</p><ul><li><span>Modern</span><strong>Legal</strong></li><li><span>Commander</span><strong>Legal</strong></li><li><span>Pauper</span><strong>Legal</strong></li><li><span>Legacy</span><strong>Legal</strong></li><li><span>Pioneer</span><em>Not legal</em></li><li><span>Standard</span><em>Not legal</em></li></ul></div>
          </section>

          <section class="centerfold-editions" aria-labelledby="centerfold-editions-title">
            <header><p class="centerfold-index">04</p><div><p class="section-label">Material history</p><h2 id="centerfold-editions-title">Other printings</h2></div></header>
            <div class="centerfold-printing-grid">${printingCards(6)}</div>
            <button class="load-row" data-load-more type="button"><span>Show more printings</span><small>6 / 91</small></button>
          </section>
        </div>
      </article>
      ${dock()}
      ${zoomDialog()}
      <div class="prototype-toast" data-toast role="status" aria-live="polite"></div>
    </div>
  `;
}
