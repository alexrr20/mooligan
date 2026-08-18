import { cardVisual, dock, printingCards, quantityControl, zoomDialog } from "../content.js";

export function renderContactSheet() {
  return `
    <div class="prototype-shell contact-sheet proto-enter" id="prototype-card">
      <div class="window-bar"><span>Mooligan</span><span>Collector view · Local only</span></div>
      <div class="contact-page">
        <header class="contact-header">
          <button class="back-link" data-back type="button"><span aria-hidden="true">←</span> Results / “lightning”</button>
          <div class="contact-identity"><div><p class="eyebrow">Instant · Red · M11 149</p><h1>Lightning Bolt</h1></div><span class="mana-cost"><i>R</i></span></div>
          <div class="contact-tools"><label>Edition view<select><option>Newest first</option><option>Oldest first</option><option>By set</option></select></label><button data-favorite aria-pressed="false" type="button">Pin <span aria-hidden="true">☆</span></button></div>
        </header>

        <div class="contact-grid">
          <section class="contact-summary" aria-label="Selected card summary">
            <div class="contact-art">${cardVisual("is-compact-card")}</div>
            <div class="contact-rules">
              <p class="section-label">Oracle text</p><p class="oracle-copy">Lightning Bolt deals 3 damage to any target.</p>
              <dl class="micro-facts"><div><dt>MV</dt><dd>1</dd></div><div><dt>Identity</dt><dd>R</dd></div><div><dt>Type</dt><dd>Instant</dd></div></dl>
              <details open><summary>Selected printing</summary><dl class="metadata-list"><div><dt>Edition</dt><dd data-edition>Magic 2011</dd></div><div><dt>Collector</dt><dd>149 / 249</dd></div><div><dt>Artist</dt><dd>Christopher Moeller</dd></div><div><dt>Finish</dt><dd>Nonfoil</dd></div></dl></details>
              <details><summary>Format legality</summary><p class="legal-copy"><span>Modern · Legal</span><span>Commander · Legal</span><span>Pauper · Legal</span><span>Standard · Not legal</span></p></details>
              <div class="contact-owned"><span>Owned</span>${quantityControl()}<button class="primary-action" data-collect aria-pressed="true" type="button">In collection</button></div>
            </div>
          </section>

          <section class="contact-browser" aria-labelledby="contact-printings-title">
            <header><div><p class="section-label">Print history</p><h2 id="contact-printings-title">91 editions</h2></div><div class="contact-filters"><button class="filter-chip is-on" data-filter type="button" aria-pressed="true">Paper</button><button class="filter-chip" data-filter type="button" aria-pressed="false">Foil</button><button class="filter-chip" data-filter type="button" aria-pressed="false">Promo</button></div></header>
            <div class="contact-printings">${printingCards()}</div>
            <button class="load-row" data-load-more type="button"><span>Load 16 more editions</span><small>8 / 91</small></button>
          </section>
        </div>
      </div>
      ${dock()}
      ${zoomDialog()}
      <div class="prototype-toast" data-toast role="status" aria-live="polite"></div>
    </div>
  `;
}
