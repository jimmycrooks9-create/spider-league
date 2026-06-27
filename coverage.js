import { escapeHtml } from "./core.js";

const [recordsResponse, queueResponse] = await Promise.all([
  fetch("data/sdi-records.json"),
  fetch("data/research-queue.json")
]);

if (!recordsResponse.ok || !queueResponse.ok) {
  throw new Error("Coverage data could not be loaded.");
}

const records = await recordsResponse.json();
const queue = await queueResponse.json();
const scored = records.filter((record) => record.sdiDisplayed != null && record.taxonName !== "Araneae");
const gaps = records.filter((record) => record.sdiDisplayed == null);

const summary = document.querySelector("#coverage-summary");
summary.innerHTML = `
  <div><strong>${scored.length}</strong><span>scored taxon records</span></div>
  <div><strong>${gaps.length}</strong><span>explicit evidence gaps</span></div>
  <div><strong>${queue.length}</strong><span>queued evidence reviews</span></div>
`;

function sourceList(sources = []) {
  if (!sources.length) return "";
  return `<ul class="compact-sources">${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a></li>`).join("")}</ul>`;
}

function recordCard(record) {
  return `
    <article class="mini-card">
      <p class="eyebrow">${escapeHtml(record.taxonRank)}</p>
      <h3><i>${escapeHtml(record.taxonName)}</i></h3>
      <p class="mini-score">${Number(record.sdiDisplayed).toFixed(1)} / 10</p>
      <p><strong>${escapeHtml(record.confidence)}</strong> confidence · ${escapeHtml(record.evidenceScope)}</p>
      <p>${escapeHtml(record.typicalOutcome)}</p>
      ${sourceList(record.sources)}
    </article>`;
}

function gapCard(record) {
  return `
    <article class="mini-card">
      <p class="eyebrow">${escapeHtml(record.taxonRank)}</p>
      <h3><i>${escapeHtml(record.taxonName)}</i></h3>
      <p><strong>Not directly scored.</strong> ${escapeHtml(record.evidenceScope)}</p>
      <p>${escapeHtml(record.typicalOutcome)}</p>
      ${sourceList(record.sources)}
    </article>`;
}

function queueCard(item) {
  return `
    <article class="mini-card">
      <p class="eyebrow">${escapeHtml(item.priority)} priority · ${escapeHtml(item.rank)}</p>
      <h3>${escapeHtml(item.commonName)}</h3>
      <p><i>${escapeHtml(item.taxonName)}</i></p>
      <p><strong>Current status:</strong> ${escapeHtml(item.status)}</p>
      <p>${escapeHtml(item.reason)}</p>
      ${sourceList(item.occurrenceSources)}
    </article>`;
}

document.querySelector("#scored-records").innerHTML = scored.map(recordCard).join("");
document.querySelector("#gap-records").innerHTML = gaps.map(gapCard).join("");
document.querySelector("#research-queue").innerHTML = queue.map(queueCard).join("");
