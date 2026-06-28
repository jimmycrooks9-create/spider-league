import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  canonicalRank,
  escapeHtml,
  isFallbackResult,
  normalize,
  resolveSdi,
  validateTaxonomyMatch
} from "./core.js";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase-client.js";
import { dateFromTimestamp } from "./league-core.js";

const FIREBASE_VERSION = "0.7.0";
const COL_XR_CHECKLIST_KEY = "7ddf754f-d193-4cc9-b351-99906754a03b";
const INAT_BASE = "https://api.inaturalist.org/v1";
const GBIF_BASE = "https://api.gbif.org/v2";
const REQUEST_TIMEOUT_MS = 9000;

const setupPanel = document.querySelector("#setup-panel");
const authPanel = document.querySelector("#auth-panel");
const adminPanel = document.querySelector("#admin-panel");
const signInForm = document.querySelector("#sign-in-form");
const authStatus = document.querySelector("#auth-status");
const signedInEmail = document.querySelector("#signed-in-email");
const signOutButton = document.querySelector("#sign-out");
const submissionForm = document.querySelector("#submission-form");
const observerInput = document.querySelector("#observer-name");
const observedDateInput = document.querySelector("#observed-date");
const spiderInput = document.querySelector("#submission-spider");
const resolveButton = document.querySelector("#resolve-spider");
const lookupStatus = document.querySelector("#lookup-status");
const choicesEl = document.querySelector("#submission-choices");
const previewEl = document.querySelector("#submission-preview");
const addButton = document.querySelector("#add-submission");
const submissionStatus = document.querySelector("#submission-status");
const adminListStatus = document.querySelector("#admin-list-status");
const adminListEl = document.querySelector("#admin-submission-list");

let aliases = [];
let records = [];
let snapshots = [];
let spiderOrderId = null;
let selectedSpider = null;
let currentUser = null;
let unsubscribeSubmissions = null;
let services = null;

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}
observedDateInput.value = todayIso();

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers ?? {}) },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The lookup service took too long to respond.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadLookupData() {
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

function setLookupStatus(message, kind = "neutral") {
  lookupStatus.textContent = message;
  lookupStatus.dataset.kind = kind;
}

function findManualAlias(queryText) {
  const normalized = normalize(queryText);
  return aliases.find((entry) => normalize(entry.alias) === normalized) ?? null;
}

function findSnapshot(scientificName, rank = "") {
  return snapshots.find(
    (snapshot) =>
      normalize(snapshot.acceptedName) === normalize(scientificName) &&
      (!rank || canonicalRank(snapshot.rank) === canonicalRank(rank))
  ) ?? null;
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

async function suggestSpiderTaxa(queryText) {
  const url = new URL(`${INAT_BASE}/taxa/autocomplete`);
  url.searchParams.set("q", queryText);
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
  return validateTaxonomyMatch(await fetchJson(url), rank);
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

function clearSelection() {
  selectedSpider = null;
  previewEl.innerHTML = "";
  choicesEl.innerHTML = "";
  addButton.disabled = true;
}

function showChoices(candidates) {
  clearSelection();
  if (!candidates.length) {
    setLookupStatus("No spider match was found. Try a scientific name or a more specific common name.", "error");
    return;
  }
  setLookupStatus(candidates.length === 1 ? "Confirm the possible match below." : "Choose the spider you intended:");
  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.innerHTML = `
      <span><strong>${escapeHtml(candidate.commonName || candidate.scientificName)}</strong><br>
      <small><i>${escapeHtml(candidate.scientificName)}</i></small></span>
      <small>${escapeHtml(candidate.rank)}</small>`;
    button.addEventListener("click", () => resolveForSubmission(candidate.scientificName, candidate.rank, candidate.commonName));
    choicesEl.appendChild(button);
  }
}

function renderPreview(resolved, sdi, commonName) {
  const { record, appliedTaxonName, appliedTaxonRank, displayedConfidence } = sdi;
  const usedFallback = isFallbackResult(resolved, sdi);
  selectedSpider = {
    commonName: commonName || resolved.acceptedName,
    scientificName: resolved.acceptedName,
    taxonRank: resolved.rank,
    sdi: Number(record.sdiDisplayed),
    confidence: displayedConfidence,
    evidenceScope: record.evidenceScope,
    scoreSourceTaxon: appliedTaxonName,
    scoreSourceRank: appliedTaxonRank,
    scoreReviewedDate: record.reviewedDate ?? "not recorded"
  };
  choicesEl.innerHTML = "";
  setLookupStatus("");
  previewEl.innerHTML = `
    <article class="submission-preview-card">
      <div>
        <p class="eyebrow">READY TO SUBMIT</p>
        <h3>${escapeHtml(selectedSpider.commonName)}</h3>
        <p><i>${escapeHtml(selectedSpider.scientificName)}</i> · ${escapeHtml(selectedSpider.taxonRank)}</p>
        ${usedFallback ? `<p class="fallback compact-fallback">Score uses a ${escapeHtml(appliedTaxonRank.toLowerCase())}-level fallback.</p>` : ""}
      </div>
      <strong class="preview-score">${selectedSpider.sdi.toFixed(1)}</strong>
    </article>`;
  addButton.disabled = false;
}

async function resolveForSubmission(scientificName, rank = "", commonName = "") {
  try {
    setLookupStatus("Validating spider taxonomy…");
    clearSelection();
    const resolved = await resolveTaxonomy(scientificName, rank);
    const sdi = resolveSdi(records, resolved);
    renderPreview(resolved, sdi, commonName);
  } catch (error) {
    setLookupStatus(error?.message ?? "Unable to resolve the spider.", "error");
  }
}

async function handleSpiderLookup() {
  const queryText = spiderInput.value.trim();
  if (!queryText) {
    setLookupStatus("Enter a spider name.", "error");
    return;
  }
  const alias = findManualAlias(queryText);
  if (alias) {
    await resolveForSubmission(alias.scientificName, alias.rank, alias.commonName ?? alias.alias);
    return;
  }
  try {
    setLookupStatus("Searching spider names…");
    clearSelection();
    const candidates = await suggestSpiderTaxa(queryText);
    const exact = candidates.filter(
      (candidate) =>
        normalize(candidate.scientificName) === normalize(queryText) ||
        normalize(candidate.commonName) === normalize(queryText)
    );
    if (exact.length === 1) {
      await resolveForSubmission(exact[0].scientificName, exact[0].rank, exact[0].commonName);
    } else {
      showChoices(candidates);
    }
  } catch (error) {
    setLookupStatus(error?.message ?? "The spider lookup could not be completed.", "error");
  }
}

function friendlyAuthError(error) {
  const code = error?.code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
    return "The email or password was not accepted.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  return error?.message ?? "Sign-in failed.";
}

async function verifyAdmin(user) {
  const adminDocument = await getDoc(doc(services.db, "admins", user.uid));
  return adminDocument.exists();
}

function formatDate(value) {
  const date = dateFromTimestamp(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function renderAdminList(entries) {
  const sorted = [...entries].sort((a, b) => {
    const createdA = dateFromTimestamp(a.createdAt)?.getTime() ?? 0;
    const createdB = dateFromTimestamp(b.createdAt)?.getTime() ?? 0;
    if (createdA !== createdB) return createdB - createdA;
    const observedA = dateFromTimestamp(a.observedAt)?.getTime() ?? 0;
    const observedB = dateFromTimestamp(b.observedAt)?.getTime() ?? 0;
    return observedB - observedA;
  });
  if (!sorted.length) {
    adminListEl.innerHTML = `<article class="card empty-state"><p>No official submissions yet.</p></article>`;
    adminListStatus.textContent = "";
    return;
  }
  adminListEl.innerHTML = sorted.map((entry) => `
    <article class="admin-submission-row">
      <div>
        <strong>${escapeHtml(entry.observerName)} — ${escapeHtml(entry.commonName || entry.scientificName)}</strong>
        <small><i>${escapeHtml(entry.scientificName)}</i> · observed ${escapeHtml(formatDate(entry.observedAt))}</small>
      </div>
      <div class="admin-row-actions">
        <strong>${Number(entry.sdi).toFixed(1)}</strong>
        <button type="button" class="danger-button" data-delete-id="${escapeHtml(entry.id)}">Delete</button>
      </div>
    </article>`).join("");

  adminListEl.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteId;
      if (!window.confirm("Delete this official submission? This cannot be undone.")) return;
      button.disabled = true;
      try {
        await deleteDoc(doc(services.db, "submissions", id));
      } catch (error) {
        adminListStatus.textContent = error?.message ?? "The submission could not be deleted.";
        adminListStatus.dataset.kind = "error";
        button.disabled = false;
      }
    });
  });
  adminListStatus.textContent = "";
}

function startAdminList() {
  unsubscribeSubmissions?.();
  const submissionsQuery = query(collection(services.db, "submissions"), limit(500));
  unsubscribeSubmissions = onSnapshot(
    submissionsQuery,
    (snapshot) => renderAdminList(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
    (error) => {
      adminListStatus.textContent = error?.message ?? "The submissions could not be loaded.";
      adminListStatus.dataset.kind = "error";
    }
  );
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authStatus.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(
      services.auth,
      document.querySelector("#admin-email").value.trim(),
      document.querySelector("#admin-password").value
    );
  } catch (error) {
    authStatus.textContent = friendlyAuthError(error);
    authStatus.dataset.kind = "error";
  }
});

signOutButton.addEventListener("click", () => signOut(services.auth));
resolveButton.addEventListener("click", handleSpiderLookup);
spiderInput.addEventListener("input", () => {
  clearSelection();
  setLookupStatus("");
});

submissionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submissionStatus.textContent = "";

  const observerName = observerInput.value.trim();
  const observedDate = observedDateInput.value;
  if (!observerName || !observedDate || !selectedSpider || !currentUser) {
    submissionStatus.textContent = "Complete the observer, date, and resolved spider before submitting.";
    submissionStatus.dataset.kind = "error";
    return;
  }

  const observedDateObject = new Date(`${observedDate}T12:00:00.000Z`);
  if (Number.isNaN(observedDateObject.getTime())) {
    submissionStatus.textContent = "Enter a valid observation date.";
    submissionStatus.dataset.kind = "error";
    return;
  }

  addButton.disabled = true;
  submissionStatus.textContent = "Adding official submission…";
  try {
    await addDoc(collection(services.db, "submissions"), {
      observerName,
      ...selectedSpider,
      scoreVersion: FIREBASE_VERSION,
      observedAt: Timestamp.fromDate(observedDateObject),
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    submissionStatus.textContent = "Official submission added. The standings have been updated.";
    submissionStatus.dataset.kind = "neutral";
    spiderInput.value = "";
    clearSelection();
    observerInput.focus();
  } catch (error) {
    submissionStatus.textContent = error?.message ?? "The official submission could not be added.";
    submissionStatus.dataset.kind = "error";
    addButton.disabled = false;
  }
});

async function initialize() {
  if (!isFirebaseConfigured()) {
    setupPanel.hidden = false;
    return;
  }

  try {
    await loadLookupData();
    services = getFirebaseServices();
    authPanel.hidden = false;

    onAuthStateChanged(services.auth, async (user) => {
      unsubscribeSubmissions?.();
      currentUser = null;
      adminPanel.hidden = true;
      if (!user) {
        authPanel.hidden = false;
        authStatus.textContent = "";
        return;
      }

      authStatus.textContent = "Checking admin access…";
      try {
        if (!(await verifyAdmin(user))) {
          await signOut(services.auth);
          authStatus.textContent = "This account is signed in but is not designated as a Spider League admin.";
          authStatus.dataset.kind = "error";
          return;
        }
        currentUser = user;
        authPanel.hidden = true;
        adminPanel.hidden = false;
        signedInEmail.textContent = user.email ?? "admin";
        startAdminList();
      } catch (error) {
        authStatus.textContent = error?.message ?? "Admin access could not be verified.";
        authStatus.dataset.kind = "error";
      }
    });
  } catch (error) {
    setupPanel.hidden = false;
    setupPanel.insertAdjacentHTML("beforeend", `<p class="status" data-kind="error">${escapeHtml(error?.message ?? "The admin page could not start.")}</p>`);
  }
}

await initialize();
