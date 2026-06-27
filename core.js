export const normalize = (value = "") =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);

export const canonicalRank = (value = "") => String(value).toUpperCase();

export function findRecord(records, taxonName, taxonRank) {
  if (!taxonName) return null;
  return records.find(
    (record) =>
      normalize(record.taxonName) === normalize(taxonName) &&
      canonicalRank(record.taxonRank) === canonicalRank(taxonRank)
  ) ?? null;
}

export function classificationName(resolved, rank) {
  const targetRank = canonicalRank(rank);
  if (canonicalRank(resolved.rank) === targetRank) return resolved.acceptedName;
  return resolved.classification.find(
    (item) => canonicalRank(item.rank) === targetRank
  )?.name ?? null;
}

export function validateTaxonomyMatch(match, requestedRank = "") {
  const accepted = match.acceptedUsage ?? match.usage;
  const classification = Array.isArray(match.classification)
    ? match.classification
    : [];
  const order = classification.find(
    (item) => canonicalRank(item.rank) === "ORDER"
  );
  const matchType = match.diagnostics?.matchType ?? "UNKNOWN";
  const matchConfidence = match.diagnostics?.confidence ?? null;

  if (!accepted || order?.name !== "Araneae") {
    throw new Error("That name did not resolve to a spider.");
  }

  const acceptedRank = canonicalRank(accepted.rank);
  const expectedRank = canonicalRank(requestedRank);

  if (expectedRank && acceptedRank !== expectedRank) {
    throw new Error(
      `That name resolved only to ${acceptedRank.toLowerCase()} level, not ${expectedRank.toLowerCase()} level. Choose a more specific match.`
    );
  }

  if (["NONE", "HIGHERRANK"].includes(matchType)) {
    throw new Error("The taxonomic match was not specific enough to rate safely.");
  }

  if (matchType === "FUZZY" && (matchConfidence ?? 0) < 90) {
    throw new Error("The taxonomic match was too uncertain. Choose a suggested name instead.");
  }

  return {
    acceptedName: accepted.canonicalName ?? accepted.name,
    acceptedFullName: accepted.name,
    rank: acceptedRank,
    taxonKey: accepted.key,
    classification,
    matchType,
    matchConfidence,
    synonym: Boolean(match.synonym),
    enteredUsage: match.usage?.canonicalName ?? match.usage?.name ?? accepted.name,
    taxonomySource: "GBIF Catalogue of Life XR"
  };
}

function lowerFallbackConfidence(record, inputRank, appliedRank) {
  if (canonicalRank(inputRank) === canonicalRank(appliedRank)) {
    return record.confidence;
  }
  if (["GENUS", "FAMILY"].includes(canonicalRank(appliedRank))) return "low";
  return "baseline";
}

export function resolveSdi(records, resolved) {
  const exactRecord = findRecord(records, resolved.acceptedName, resolved.rank);
  const genus = classificationName(resolved, "GENUS");
  const family = classificationName(resolved, "FAMILY");

  const genusRecord = findRecord(records, genus, "GENUS");
  const safetyRecord =
    (exactRecord?.safetyLevel && exactRecord.safetyLevel !== "none" && exactRecord) ||
    (genusRecord?.safetyLevel && genusRecord.safetyLevel !== "none" && genusRecord) ||
    null;

  const candidates = [
    { name: resolved.acceptedName, rank: resolved.rank },
    { name: genus, rank: "GENUS" },
    { name: family, rank: "FAMILY" },
    { name: "Araneae", rank: "ORDER" }
  ];

  for (const candidate of candidates) {
    const record = findRecord(records, candidate.name, candidate.rank);
    if (record?.sdiDisplayed != null) {
      return {
        record,
        exactRecord,
        evidenceGapRecord:
          exactRecord?.sdiDisplayed == null ? exactRecord : null,
        appliedTaxonName: candidate.name,
        appliedTaxonRank: canonicalRank(candidate.rank),
        displayedConfidence: lowerFallbackConfidence(
          record,
          resolved.rank,
          candidate.rank
        ),
        safetyRecord
      };
    }
  }

  throw new Error("No SDI fallback record is available.");
}

export function isFallbackResult(resolved, sdi) {
  return (
    normalize(sdi.appliedTaxonName) !== normalize(resolved.acceptedName) ||
    canonicalRank(sdi.appliedTaxonRank) !== canonicalRank(resolved.rank)
  );
}
