import fs from "node:fs";

const read = (relative) => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"));
const aliases = read("data/manual-aliases.json");
const records = read("data/sdi-records.json");
const snapshots = read("data/taxon-snapshots.json");
const researchQueue = read("data/research-queue.json");
const errors = [];
const allowedRanks = new Set(["ORDER", "FAMILY", "GENUS", "SPECIES"]);
const allowedSafety = new Set(["none", "medical-attention", "emergency"]);
const key = (name, rank) => `${String(name).toLowerCase()}|${String(rank).toUpperCase()}`;

function unique(items, makeKey, label) {
  const seen = new Set();
  for (const item of items) {
    const current = makeKey(item);
    if (seen.has(current)) errors.push(`Duplicate ${label}: ${current}`);
    seen.add(current);
  }
}

unique(aliases, (item) => item.alias.trim().toLowerCase(), "alias");
unique(records, (item) => key(item.taxonName, item.taxonRank), "SDI record");
unique(snapshots, (item) => key(item.acceptedName, item.rank), "taxonomy snapshot");
unique(researchQueue, (item) => key(item.taxonName, item.rank), "research queue item");

const snapshotKeys = new Set(snapshots.map((item) => key(item.acceptedName, item.rank)));
const allowedPriorities = new Set(["high", "medium", "low"]);
for (const alias of aliases) {
  if (!alias.alias || !alias.scientificName || !allowedRanks.has(alias.rank)) {
    errors.push(`Malformed alias: ${JSON.stringify(alias)}`);
  }
  if (!snapshotKeys.has(key(alias.scientificName, alias.rank))) {
    errors.push(`Alias lacks an offline taxonomy snapshot: ${alias.alias} → ${alias.scientificName}`);
  }
}

for (const record of records) {
  if (!record.taxonName || !allowedRanks.has(record.taxonRank)) {
    errors.push(`Malformed record: ${JSON.stringify(record)}`);
  }
  if (!allowedSafety.has(record.safetyLevel)) {
    errors.push(`Invalid safety level for ${record.taxonName}`);
  }
  for (const field of ["sdiRaw", "sdiDisplayed"]) {
    const value = record[field];
    if (value != null && (!Number.isFinite(value) || value < 0 || value > 10)) {
      errors.push(`${field} out of range for ${record.taxonName}`);
    }
  }
  if (record.sdiDisplayed != null && Math.abs(record.sdiDisplayed * 2 - Math.round(record.sdiDisplayed * 2)) > 1e-9) {
    errors.push(`Displayed SDI is not on a half-point increment for ${record.taxonName}`);
  }
  if (record.sdiDisplayed == null && record.confidence !== "insufficient") {
    errors.push(`Null SDI must use insufficient confidence for ${record.taxonName}`);
  }
  if (record.sdiDisplayed != null && (!Array.isArray(record.sources) || record.sources.length === 0)) {
    errors.push(`Scored record lacks sources: ${record.taxonName}`);
  }
  for (const source of record.sources ?? []) {
    try { new URL(source.url); } catch { errors.push(`Invalid source URL for ${record.taxonName}`); }
  }
}

const baselines = records.filter((item) => item.taxonName === "Araneae" && item.taxonRank === "ORDER" && item.sdiDisplayed != null);
if (baselines.length !== 1) errors.push(`Expected one scored Araneae baseline, found ${baselines.length}`);

for (const item of researchQueue) {
  if (!item.taxonName || !allowedRanks.has(item.rank) || !allowedPriorities.has(item.priority)) {
    errors.push(`Malformed research queue item: ${JSON.stringify(item)}`);
  }
  if (!snapshotKeys.has(key(item.taxonName, item.rank))) {
    errors.push(`Research queue item lacks taxonomy snapshot: ${item.taxonName}`);
  }
}

for (const snap of snapshots) {
  if (!allowedRanks.has(snap.rank)) errors.push(`Invalid snapshot rank: ${snap.acceptedName}`);
  const order = snap.classification?.find((item) => item.rank === "ORDER")?.name;
  if (order !== "Araneae") errors.push(`Snapshot is not classified in Araneae: ${snap.acceptedName}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${aliases.length} aliases, ${records.length} SDI records, ${snapshots.length} taxonomy snapshots, and ${researchQueue.length} research queue items.`);
