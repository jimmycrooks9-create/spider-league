import { collection, limit, onSnapshot, query } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { escapeHtml } from "./core.js";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase-client.js";
import { dateFromTimestamp, rankSubmissions } from "./league-core.js";

const statusEl = document.querySelector("#league-status");
const leaderboardEl = document.querySelector("#leaderboard");
const submissionCountEl = document.querySelector("#submission-count");
const observerCountEl = document.querySelector("#observer-count");
const topScoreEl = document.querySelector("#top-score");

function setStatus(message, kind = "neutral") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
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

function renderSummary(entries) {
  submissionCountEl.textContent = String(entries.length);
  observerCountEl.textContent = String(
    new Set(entries.map((entry) => entry.observerName.trim().toLowerCase())).size
  );
  topScoreEl.textContent = entries.length
    ? Number(entries[0].sdi).toFixed(1)
    : "—";
}

function renderLeaderboard(entries) {
  const ranked = rankSubmissions(entries);
  renderSummary(ranked);

  if (!ranked.length) {
    leaderboardEl.innerHTML = `
      <article class="card empty-state">
        <h2>No official submissions yet</h2>
        <p>The leaderboard will populate as soon as the first observation is approved.</p>
      </article>`;
    setStatus("");
    return;
  }

  leaderboardEl.innerHTML = `
    <div class="leaderboard-table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Observer</th>
            <th scope="col">Spider</th>
            <th scope="col">Observed</th>
            <th scope="col">SDI</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((entry) => `
            <tr>
              <td data-label="Rank"><span class="rank-badge">${entry.rank}</span></td>
              <td data-label="Observer"><strong>${escapeHtml(entry.observerName)}</strong></td>
              <td data-label="Spider">
                <strong>${escapeHtml(entry.commonName || entry.scientificName)}</strong>
                <small><i>${escapeHtml(entry.scientificName)}</i></small>
              </td>
              <td data-label="Observed">${escapeHtml(formatDate(entry.observedAt))}</td>
              <td data-label="SDI"><span class="table-score">${Number(entry.sdi).toFixed(1)}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  setStatus("");
}

if (!isFirebaseConfigured()) {
  renderSummary([]);
  leaderboardEl.innerHTML = `
    <article class="card setup-card">
      <h2>League database setup required</h2>
      <p>The ranking page is built, but Firebase still needs to be connected before submissions can be stored.</p>
      <p><a href="firebase-setup.html">Open the setup instructions</a></p>
    </article>`;
  setStatus("The public SDI rater is still available; only league storage is awaiting setup.", "error");
} else {
  try {
    const { db } = getFirebaseServices();
    const submissionsQuery = query(collection(db, "submissions"), limit(500));
    onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));
        renderLeaderboard(entries);
      },
      (error) => {
        console.error(error);
        setStatus("The standings could not be loaded. Check the Firebase setup and security rules.", "error");
      }
    );
  } catch (error) {
    setStatus(error?.message ?? "The league database could not start.", "error");
  }
}
