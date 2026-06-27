import {
  canonicalRank,
  escapeHtml,
  isFallbackResult,
  normalize,
  resolveSdi,
  validateTaxonomyMatch
} from "./core.js";

const COL_XR_CHECKLIST_KEY = "7ddf754f-d193-4cc9-b351-99906754a03b";
const INAT_BASE = "https://api.inaturalist.org/v1";
const GBIF_BASE = "https://api.gbif.org/v2";
const REQUEST_TIMEOUT_MS = 9000;
const MAX_RECENT_SEARCHES = 6;

const form = document.querySelector("#search-form");
const input = document.querySelector("#spider-name");
const statusEl = document.querySelector("#status");
const choicesEl = document.querySelector("#choices");
const resultEl = document.querySelector("#result");
const recentEl = document.querySelector("#recent-searches");
const installButton = document.querySelector("#install-app");

let aliases = [];
let records = [];
let snapshots = [];
let spiderOrderId = null;
let deferredInstallPrompt = null;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers ?? {}) },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The lookup service took too long to respond.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadData() {
  const [aliasResponse, recordResponse, snapshotResponse] = await Promise.all([
    fetch("data/manual-aliases.json"),
    fetch("data/sdi-records.json"),
    fetch("data/taxon-snapshots.json")
  ]);

  if (!aliasResponse.ok || !recordResponse.ok || !snapshotResponse.ok) {
    throw new Error("Local SDI data could not be loaded.");
  }

  aliases = await aliasResponse.json();
  records = await recordResponse.json();
  snapshots = await snapshotResponse.json();
}

function setStatus(message, kind = "neutral") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

async function getSpiderOrderId() {
  if (spiderOrderId) return spiderOrderId;

  const url = new URL(`${INAT_BASE}/taxa/autocomplete`);
  url.searchParams.set("q", "Araneae");
  url.searchParams.set("rank", "order");
  url.searchParams.set("per_page", "10");
  url.searchParams.set("locale", "en");

  const payload = await fetchJson(url);
  const araneae = payload.results?.find(
    (taxon) => taxon.name === "Araneae" && taxon.rank === "order"
  );

  if (!araneae) throw new Error("The spider taxonomic order could not be resolved.");
  spiderOrderId = araneae.id;
  return spiderOrderId;
}

async function isSpiderTaxon(taxon) {
  const orderId = await getSpiderOrderId();
  return taxon.id === orderId || taxon.ancestor_ids?.includes(orderId);
}

function findManualAlias(query) {
  const normalized = normalize(query);
  return aliases.find((entry) => normalize(entry.alias) === normalized) ?? null;
}

function findSnapshot(scientificName, rank = "") {
  return snapshots.find(
    (snapshot) =>
      normalize(snapshot.acceptedName) === normalize(scientificName) &&
      (!rank || canonicalRank(snapshot.rank) === canonicalRank(rank))
  ) ?? null;
}

async function suggestSpiderTaxa(query) {
  const url = new URL(`${INAT_BASE}/taxa/autocomplete`);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "15");
  url.searchParams.set("locale", "en");

  const payload = await fetchJson(url);
  const candidates = [];
  const seen = new Set();

  for (const taxon of payload.results ?? []) {
    if (!(await isSpiderTaxon(taxon))) continue;

    const key = `${normalize(taxon.name)}|${canonicalRank(taxon.rank)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      scientificName: taxon.name,
      commonName: taxon.preferred_common_name ?? "",
      rank: canonicalRank(taxon.rank)
    });
  }

  return candidates.slice(0, 8);
}

async function validateWithCatalogueOfLife(scientificName, rank = "") {
  const url = new URL(`${GBIF_BASE}/species/match`);
  url.searchParams.set("scientificName", scientificName);
  url.searchParams.set("order", "Araneae");
  url.searchParams.set("checklistKey", COL_XR_CHECKLIST_KEY);
  if (rank) url.searchParams.set("taxonRank", rank.toLowerCase());

  const match = await fetchJson(url);
  return validateTaxonomyMatch(match, rank);
}

async function resolveTaxonomy(scientificName, rank = "") {
  const snapshot = findSnapshot(scientificName, rank);

  try {
    return await validateWithCatalogueOfLife(scientificName, rank);
  } catch (error) {
    if (!snapshot) throw error;
    return {
      ...snapshot,
      matchType: "LOCAL_SNAPSHOT",
      matchConfidence: null,
      taxonomySource: "Bundled taxonomy snapshot",
      taxonomyWarning: "Live taxonomy validation was unavailable; a bundled reviewed snapshot was used."
    };
  }
}

function showChoices(candidates) {
  choicesEl.innerHTML = "";
  resultEl.innerHTML = "";

  if (!candidates.length) {
    setStatus(
      "No spider match was found. Try a scientific name or a more specific common name.",
      "error"
    );
    return;
  }

  setStatus(
    candidates.length === 1
      ? "One possible match found. Confirm it below."
      : "Choose the spider you intended:"
  );

  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.innerHTML = `
      <span>
        <strong><i>${escapeHtml(candidate.scientificName)}</i></strong><br>
        <small>${escapeHtml(candidate.commonName || "No common name listed")}</small>
      </span>
      <small>${escapeHtml(candidate.rank)}</small>
    `;
    button.addEventListener("click", () =>
      resolveAndDisplay(candidate.scientificName, candidate.rank, candidate.commonName)
    );
    choicesEl.appendChild(button);
  }
}

function sourceLinks(record) {
  const sources = Array.isArray(record.sources) ? record.sources : [];
  if (!sources.length) return "";

  return `
    <details class="sources">
      <summary>Evidence sources</summary>
      <ul>
        ${sources.map((source) => `
          <li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a></li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderResult(resolved, sdi, commonName = "") {
  const {
    record,
    evidenceGapRecord,
    appliedTaxonName,
    appliedTaxonRank,
    displayedConfidence,
    safetyRecord
  } = sdi;
  const usedFallback = isFallbackResult(resolved, sdi);

  const warning = safetyRecord?.safetyMessage
    ? `<div class="warning ${escapeHtml(safetyRecord.safetyLevel)}"><strong>${escapeHtml(
        safetyRecord.safetyLevel === "emergency" ? "Emergency warning" : "Medical note"
      )}:</strong> ${escapeHtml(safetyRecord.safetyMessage)}</div>`
    : "";

  const evidenceGap = evidenceGapRecord
    ? `<div class="evidence-gap"><strong>Species evidence status:</strong> ${escapeHtml(
        evidenceGapRecord.evidenceScope
      )}. The number shown below is a taxonomic fallback, not a measured species average.</div>`
    : "";

  const taxonomyWarning = resolved.taxonomyWarning
    ? `<p class="taxonomy-warning">${escapeHtml(resolved.taxonomyWarning)}</p>`
    : "";

  choicesEl.innerHTML = "";
  setStatus("");

  resultEl.innerHTML = `
    <article class="card">
      <p class="eyebrow">${escapeHtml(resolved.rank)}</p>
      <h2><i>${escapeHtml(resolved.acceptedFullName)}</i></h2>
      ${commonName ? `<p class="common-name">${escapeHtml(commonName)}</p>` : ""}
      ${
        resolved.synonym
          ? `<p>Entered name accepted as a synonym of <i>${escapeHtml(
              resolved.acceptedName
            )}</i>.</p>`
          : ""
      }
      ${taxonomyWarning}
      ${evidenceGap}

      <div class="score-line">
        <span class="score">${Number(record.sdiDisplayed).toFixed(1)}</span>
        <span class="out-of">/ 10 SDI</span>
      </div>

      <p>${escapeHtml(record.typicalOutcome)}</p>

      <dl class="meta">
        <div>
          <dt>Confidence</dt>
          <dd>${escapeHtml(displayedConfidence)}</dd>
        </div>
        <div>
          <dt>Evidence applied</dt>
          <dd>${escapeHtml(record.evidenceScope)}</dd>
        </div>
        <div>
          <dt>Score source</dt>
          <dd>${escapeHtml(appliedTaxonName)} (${escapeHtml(appliedTaxonRank)})</dd>
        </div>
        <div>
          <dt>Taxonomy</dt>
          <dd>${escapeHtml(resolved.taxonomySource ?? "Unknown")}</dd>
        </div>
        <div>
          <dt>Taxon match</dt>
          <dd>${escapeHtml(resolved.matchType)}${
            resolved.matchConfidence != null
              ? ` · ${escapeHtml(String(resolved.matchConfidence))}%`
              : ""
          }</dd>
        </div>
        <div>
          <dt>Evidence reviewed</dt>
          <dd>${escapeHtml(record.reviewedDate ?? "Not recorded")}</dd>
        </div>
      </dl>

      ${
        usedFallback
          ? `<p class="fallback"><strong>Fallback notice:</strong> No supported ${escapeHtml(
              resolved.rank.toLowerCase()
            )}-level average was available, so the closest supported taxonomic score was used.</p>`
          : ""
      }

      ${warning}
      ${sourceLinks(record)}
      <div class="result-actions">
        <button id="share-result" class="secondary-button" type="button">Share result</button>
      </div>
    </article>
  `;

  const shareUrl = new URL(window.location.href);
  shareUrl.search = "";
  shareUrl.hash = "";
  shareUrl.searchParams.set("taxon", resolved.acceptedName);
  shareUrl.searchParams.set("rank", resolved.rank);
  if (commonName) shareUrl.searchParams.set("common", commonName);
  window.history.replaceState({}, "", shareUrl);

  document.querySelector("#share-result")?.addEventListener("click", async (event) => {
    const title = `Spider League: ${commonName || resolved.acceptedName}`;
    const text = `${commonName || resolved.acceptedName} — SDI ${Number(record.sdiDisplayed).toFixed(1)} / 10 (${displayedConfidence} confidence)`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: shareUrl.toString() });
      } else {
        await navigator.clipboard.writeText(shareUrl.toString());
        event.currentTarget.textContent = "Link copied";
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        event.currentTarget.textContent = "Could not share";
      }
    }
  });

  saveRecentSearch({
    scientificName: resolved.acceptedName,
    rank: resolved.rank,
    commonName,
    score: Number(record.sdiDisplayed)
  });
}

async function resolveAndDisplay(scientificName, rank = "", commonName = "") {
  try {
    setStatus("Validating spider taxonomy…");
    choicesEl.innerHTML = "";
    resultEl.innerHTML = "";

    const resolved = await resolveTaxonomy(scientificName, rank);
    const sdi = resolveSdi(records, resolved);
    renderResult(resolved, sdi, commonName);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Unable to resolve the spider.",
      "error"
    );
  }
}

async function handleSearch(query) {
  const alias = findManualAlias(query);
  if (alias) {
    await resolveAndDisplay(alias.scientificName, alias.rank, alias.commonName ?? alias.alias);
    return;
  }

  setStatus("Searching spider names…");
  choicesEl.innerHTML = "";
  resultEl.innerHTML = "";

  const candidates = await suggestSpiderTaxa(query);
  const exactCandidates = candidates.filter(
    (candidate) =>
      normalize(candidate.scientificName) === normalize(query) ||
      normalize(candidate.commonName) === normalize(query)
  );

  if (exactCandidates.length === 1) {
    const exact = exactCandidates[0];
    await resolveAndDisplay(exact.scientificName, exact.rank, exact.commonName);
    return;
  }

  showChoices(candidates);
}

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem("spiderLeagueRecent") ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(entry) {
  const recent = getRecentSearches().filter(
    (item) => normalize(item.scientificName) !== normalize(entry.scientificName)
  );
  recent.unshift(entry);
  localStorage.setItem(
    "spiderLeagueRecent",
    JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES))
  );
  renderRecentSearches();
}

function renderRecentSearches() {
  const recent = getRecentSearches();
  if (!recent.length) {
    recentEl.innerHTML = "";
    return;
  }

  recentEl.innerHTML = `
    <h2>Recent</h2>
    <div class="recent-list">
      ${recent.map((item, index) => `
        <button type="button" data-recent-index="${index}">
          <span><i>${escapeHtml(item.scientificName)}</i>${item.commonName ? `<small>${escapeHtml(item.commonName)}</small>` : ""}</span>
          <strong>${Number(item.score).toFixed(1)}</strong>
        </button>
      `).join("")}
    </div>
  `;

  recentEl.querySelectorAll("[data-recent-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = recent[Number(button.dataset.recentIndex)];
      resolveAndDisplay(item.scientificName, item.rank, item.commonName);
    });
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();

  if (!query) {
    setStatus("Enter a spider name.", "error");
    return;
  }

  try {
    await handleSearch(query);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "The lookup could not be completed.",
      "error"
    );
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app remains usable online even if service-worker registration fails.
    });
  });
}

try {
  await loadData();
  renderRecentSearches();

  const params = new URLSearchParams(window.location.search);
  const initialTaxon = params.get("taxon");
  const initialRank = params.get("rank") ?? "";
  const initialCommonName = params.get("common") ?? "";

  if (initialTaxon) {
    input.value = initialCommonName || initialTaxon;
    await resolveAndDisplay(initialTaxon, initialRank, initialCommonName);
  } else {
    setStatus("Ready.");
  }
} catch (error) {
  setStatus(
    error instanceof Error ? error.message : "The app could not start.",
    "error"
  );
}
