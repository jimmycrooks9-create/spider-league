import { isFirebaseConfigured } from "./firebase-config.js";
const resultsEl = document.querySelector("#diagnostic-results");
const summaryEl = document.querySelector("#diagnostic-summary");
const runButton = document.querySelector("#run-diagnostics");
const TIMEOUT_MS = 9000;

async function timedFetch(url, parser = (response) => response.json()) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await parser(response);
    return { data, duration: Math.round(performance.now() - started) };
  } finally {
    window.clearTimeout(timeout);
  }
}

function card(name, status, detail, duration = null) {
  const label = status === "pass" ? "PASS" : status === "warn" ? "LIMITED" : "FAIL";
  return `<article class="mini-card diagnostic-card ${status}">
    <p class="eyebrow">${label}</p>
    <h2>${name}</h2>
    <p>${detail}</p>
    ${duration == null ? "" : `<p><small>${duration} ms</small></p>`}
  </article>`;
}

async function checkLocalData() {
  const files = ["manual-aliases.json", "sdi-records.json", "taxon-snapshots.json", "research-queue.json"];
  const counts = {};
  for (const file of files) {
    const { data } = await timedFetch(`data/${file}`);
    if (!Array.isArray(data)) throw new Error(`${file} is not an array`);
    counts[file] = data.length;
  }
  return card("Bundled data", "pass", `${counts["manual-aliases.json"]} aliases · ${counts["sdi-records.json"]} evidence records · ${counts["taxon-snapshots.json"]} taxonomy snapshots`);
}

async function checkINaturalist() {
  const url = new URL("https://api.inaturalist.org/v1/taxa/autocomplete");
  url.searchParams.set("q", "western black widow");
  url.searchParams.set("per_page", "5");
  const { data, duration } = await timedFetch(url);
  const match = data.results?.find((taxon) => taxon.name === "Latrodectus hesperus");
  if (!match) throw new Error("Expected western-black-widow result was not returned");
  return card("iNaturalist name discovery", "pass", "Common-name autocomplete returned Latrodectus hesperus.", duration);
}

async function checkGBIF() {
  const url = new URL("https://api.gbif.org/v2/species/match");
  url.searchParams.set("scientificName", "Latrodectus hesperus");
  url.searchParams.set("order", "Araneae");
  url.searchParams.set("checklistKey", "7ddf754f-d193-4cc9-b351-99906754a03b");
  const { data, duration } = await timedFetch(url);
  const accepted = data.acceptedUsage ?? data.usage;
  const order = data.classification?.find((taxon) => taxon.rank === "ORDER")?.name;
  if (!accepted || order !== "Araneae") throw new Error("Expected spider classification was not returned");
  return card("GBIF / Catalogue of Life validation", "pass", `${accepted.canonicalName ?? accepted.name} validated in order Araneae.`, duration);
}

function checkFirebase() {
  return isFirebaseConfigured()
    ? card("Firebase league database", "pass", "Firebase configuration is present. Use the Admin page to verify authentication and rules.")
    : card("Firebase league database", "warn", "Not connected yet. The SDI rater works, but official submissions and standings require Firebase setup.");
}

async function checkServiceWorker() {
  if (!("serviceWorker" in navigator)) return card("Install/offline support", "warn", "This browser does not support service workers.");
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return card("Install/offline support", "warn", "Service workers are supported, but this page is not yet controlled. Reload once after deployment.");
  return card("Install/offline support", "pass", `Service worker registered with scope ${registration.scope}`);
}

async function run() {
  runButton.disabled = true;
  resultsEl.innerHTML = "";
  summaryEl.textContent = "Running checks…";
  const checks = [
    ["Bundled data", checkLocalData],
    ["iNaturalist name discovery", checkINaturalist],
    ["GBIF taxonomy validation", checkGBIF],
    ["Firebase league database", checkFirebase],
    ["Install/offline support", checkServiceWorker]
  ];
  let failures = 0;
  for (const [name, fn] of checks) {
    try { resultsEl.insertAdjacentHTML("beforeend", await fn()); }
    catch (error) {
      failures += 1;
      const message = error?.name === "AbortError" ? "Request timed out." : (error?.message ?? "Unknown error");
      resultsEl.insertAdjacentHTML("beforeend", card(name, "fail", message));
    }
  }
  summaryEl.textContent = failures ? `${failures} check${failures === 1 ? "" : "s"} failed. Bundled aliases may still work.` : "All checks passed.";
  summaryEl.dataset.kind = failures ? "error" : "neutral";
  runButton.disabled = false;
}

runButton.addEventListener("click", run);
await run();
