import { cardVisual, dock, printingCards, quantityControl, zoomDialog } from "../content.js";

export function renderWorkbench() {
  return `
    <div class="prototype-shell workbench proto-enter" id="prototype-card">
      <div class="window-bar"><span>Mooligan</span><span>Local catalog · 98,441 cards</span></div>
      <div class="workbench-page">
        <button class="back-link" data-back type="button"><span aria-hidden="true">←</span> Back to results</button>
        <div class="workbench-grid">
          <aside class="workbench-art">
            ${cardVisual()}
            <div class="printing-caption"><span>Selected printing</span><strong data-edition>Magic 2011</strong><small>M11 · #149 · English</small></div>
          </aside>

          <section class="workbench-info" aria-labelledby="workbench-title">
            <header class="identity-block">
              <div><p class="eyebrow">Red · Instant · Mana value 1</p><h1 id="workbench-title">Lightning Bolt</h1></div>
              <span class="mana-cost"><i>R</i></span>
            </header>
            <div class="rule-tabs" role="tablist" aria-label="Card information">
              <button role="tab" aria-selected="true" data-tab="oracle" type="button">Oracle</button>
              <button role="tab" aria-selected="false" data-tab="printing" type="button">Printing</button>
              <button role="tab" aria-selected="false" data-tab="legality" type="button">Legality</button>
            </div>
            <div class="tab-panel" data-panel="oracle">
              <p class="type-line">Instant</p>
              <p class="oracle-copy">Lightning Bolt deals 3 damage to any target.</p>
              <dl class="fact-strip"><div><dt>Mana value</dt><dd>1</dd></div><div><dt>Color</dt><dd>Red</dd></div><div><dt>Keywords</dt><dd>—</dd></div></dl>
              <div class="notes-block"><span>Workspace note</span><textarea aria-label="Workspace note" placeholder="Add a private note about this card…"></textarea></div>
            </div>
            <div class="tab-panel" data-panel="printing" hidden>
              <dl class="metadata-list"><div><dt>Set</dt><dd>Magic 2011 (M11)</dd></div><div><dt>Collector no.</dt><dd>149</dd></div><div><dt>Rarity</dt><dd>Common</dd></div><div><dt>Released</dt><dd>16 Jul 2010</dd></div><div><dt>Artist</dt><dd>Christopher Moeller</dd></div><div><dt>Finishes</dt><dd>Nonfoil · Foil</dd></div></dl>
            </div>
            <div class="tab-panel" data-panel="legality" hidden>
              <ul class="legality-list"><li><span>Modern</span><strong>Legal</strong></li><li><span>Commander</span><strong>Legal</strong></li><li><span>Pauper</span><strong>Legal</strong></li><li><span>Legacy</span><strong>Legal</strong></li><li><span>Pioneer</span><em>Not legal</em></li><li><span>Standard</span><em>Not legal</em></li></ul>
            </div>

            <section class="edition-strip" aria-labelledby="workbench-editions">
              <header><div><p class="eyebrow">All editions</p><h2 id="workbench-editions">Choose a printing</h2></div><span>8 shown</span></header>
              <div class="printing-row">${printingCards(5, true)}</div>
            </section>
          </section>

          <aside class="workbench-actions" aria-label="Card workspace actions">
            <header><p class="eyebrow">Your workspace</p><h2>Card actions</h2></header>
            <div class="owned-block"><span>Owned copies</span>${quantityControl()}<small>1 foil · 1 nonfoil</small></div>
            <button class="primary-action" data-collect type="button" aria-pressed="true"><span>In collection</span><b>✓</b></button>
            <label class="deck-field">Add to deck<select data-deck><option>Choose a deck…</option><option>Izzet Prowess</option><option>Burn / Modern</option><option>Cube 540</option></select></label>
            <button class="secondary-action" data-favorite type="button" aria-pressed="false"><span>Pin card</span><b aria-hidden="true">☆</b></button>
            <dl class="compact-printing"><div><dt>Finish</dt><dd>Nonfoil</dd></div><div><dt>Language</dt><dd>English</dd></div><div><dt>Catalog status</dt><dd><i></i> Offline ready</dd></div></dl>
          </aside>
        </div>
      </div>
      ${dock()}
      ${zoomDialog()}
      <div class="prototype-toast" data-toast role="status" aria-live="polite"></div>
    </div>
  `;
}
