import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  resolveSdi,
  validateTaxonomyMatch,
  isFallbackResult
} from "../core.js";
import fs from "node:fs";

const records = JSON.parse(fs.readFileSync(new URL("../data/sdi-records.json", import.meta.url)));

const speciesMatch = {
  usage: {
    key: "AD",
    name: "Araneus diadematus Clerck, 1757",
    canonicalName: "Araneus diadematus",
    rank: "SPECIES"
  },
  classification: [
    { name: "Animalia", rank: "KINGDOM" },
    { name: "Araneae", rank: "ORDER" },
    { name: "Araneidae", rank: "FAMILY" },
    { name: "Araneus", rank: "GENUS" },
    { name: "Araneus diadematus", rank: "SPECIES" }
  ],
  diagnostics: { matchType: "EXACT", confidence: 99 },
  synonym: false
};

test("normalizes punctuation and case", () => {
  assert.equal(normalize("  White–Tailed  Spider! "), "white-tailed spider");
});

test("accepts an exact spider species match", () => {
  const resolved = validateTaxonomyMatch(speciesMatch, "SPECIES");
  assert.equal(resolved.acceptedName, "Araneus diadematus");
  assert.equal(resolved.rank, "SPECIES");
});

test("rejects a non-spider taxon", () => {
  const nonSpider = structuredClone(speciesMatch);
  nonSpider.classification[1] = { name: "Coleoptera", rank: "ORDER" };
  assert.throws(() => validateTaxonomyMatch(nonSpider, "SPECIES"), /did not resolve to a spider/);
});

test("rejects a higher-rank result for a requested species", () => {
  const genusOnly = structuredClone(speciesMatch);
  genusOnly.usage = { key: "A", name: "Araneus", canonicalName: "Araneus", rank: "GENUS" };
  genusOnly.diagnostics.matchType = "HIGHERRANK";
  assert.throws(() => validateTaxonomyMatch(genusOnly, "SPECIES"), /not species level/);
});

test("uses an exact species score when available", () => {
  const resolved = {
    acceptedName: "Latrodectus hasselti",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Theridiidae", rank: "FAMILY" },
      { name: "Latrodectus", rank: "GENUS" },
      { name: "Latrodectus hasselti", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 5);
  assert.equal(result.appliedTaxonRank, "SPECIES");
  assert.equal(isFallbackResult(resolved, result), false);
});

test("falls back to genus and lowers confidence", () => {
  const resolved = {
    acceptedName: "Latrodectus mactans",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Theridiidae", rank: "FAMILY" },
      { name: "Latrodectus", rank: "GENUS" },
      { name: "Latrodectus mactans", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 5);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.displayedConfidence, "low");
  assert.equal(isFallbackResult(resolved, result), true);
});

test("preserves an insufficient species evidence note while using baseline", () => {
  const resolved = {
    acceptedName: "Loxosceles reclusa",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Sicariidae", rank: "FAMILY" },
      { name: "Loxosceles", rank: "GENUS" },
      { name: "Loxosceles reclusa", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 2.5);
  assert.equal(result.appliedTaxonRank, "ORDER");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
  assert.equal(result.safetyRecord.safetyLevel, "medical-attention");
});

test("uses the low-confidence cross-orbweaver species score", () => {
  const resolved = {
    acceptedName: "Araneus diadematus",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Araneidae", rank: "FAMILY" },
      { name: "Araneus", rank: "GENUS" },
      { name: "Araneus diadematus", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3.5);
  assert.equal(result.appliedTaxonRank, "SPECIES");
  assert.equal(result.displayedConfidence, "low");
});

test("uses a Cheiracanthium genus fallback for the yellow sac spider", () => {
  const resolved = {
    acceptedName: "Cheiracanthium mildei",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Cheiracanthiidae", rank: "FAMILY" },
      { name: "Cheiracanthium", rank: "GENUS" },
      { name: "Cheiracanthium mildei", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3.5);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.displayedConfidence, "low");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
});

test("uses the Agelenidae family fallback for a hobo spider", () => {
  const resolved = {
    acceptedName: "Eratigena agrestis",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Agelenidae", rank: "FAMILY" },
      { name: "Eratigena", rank: "GENUS" },
      { name: "Eratigena agrestis", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3);
  assert.equal(result.appliedTaxonRank, "FAMILY");
  assert.equal(result.displayedConfidence, "low");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
});

test("uses the widow genus fallback and preserves the western-black-widow note", () => {
  const resolved = {
    acceptedName: "Latrodectus hesperus",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Theridiidae", rank: "FAMILY" },
      { name: "Latrodectus", rank: "GENUS" },
      { name: "Latrodectus hesperus", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 5);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
  assert.equal(result.safetyRecord.safetyLevel, "medical-attention");
});

test("uses the supported Lampona genus score for a broad white-tail result", () => {
  const resolved = {
    acceptedName: "Lampona",
    rank: "GENUS",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Lamponidae", rank: "FAMILY" },
      { name: "Lampona", rank: "GENUS" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3.5);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.displayedConfidence, "moderate");
});



test("uses the Araneidae family fallback for an unscored orb-weaver", () => {
  const resolved = {
    acceptedName: "Araneus marmoreus",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Araneidae", rank: "FAMILY" },
      { name: "Araneus", rank: "GENUS" },
      { name: "Araneus marmoreus", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3);
  assert.equal(result.appliedTaxonRank, "FAMILY");
  assert.equal(result.displayedConfidence, "low");
});

test("uses the Salticidae family score for an unscored jumping spider", () => {
  const resolved = {
    acceptedName: "Phidippus audax",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Salticidae", rank: "FAMILY" },
      { name: "Phidippus", rank: "GENUS" },
      { name: "Phidippus audax", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 2.5);
  assert.equal(result.appliedTaxonRank, "FAMILY");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
});

test("uses the Steatoda genus fallback and preserves the cupboard-spider gap", () => {
  const resolved = {
    acceptedName: "Steatoda grossa",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Theridiidae", rank: "FAMILY" },
      { name: "Steatoda", rank: "GENUS" },
      { name: "Steatoda grossa", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
  assert.equal(result.safetyRecord.safetyLevel, "medical-attention");
});


test("uses the directly scored woodlouse-spider species record", () => {
  const resolved = {
    acceptedName: "Dysdera crocata",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Dysderidae", rank: "FAMILY" },
      { name: "Dysdera", rank: "GENUS" },
      { name: "Dysdera crocata", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 3.5);
  assert.equal(result.appliedTaxonRank, "SPECIES");
  assert.equal(result.displayedConfidence, "low");
});

test("uses the Kukulcania genus fallback for the southern house spider", () => {
  const resolved = {
    acceptedName: "Kukulcania hibernalis",
    rank: "SPECIES",
    classification: [
      { name: "Araneae", rank: "ORDER" },
      { name: "Filistatidae", rank: "FAMILY" },
      { name: "Kukulcania", rank: "GENUS" },
      { name: "Kukulcania hibernalis", rank: "SPECIES" }
    ]
  };
  const result = resolveSdi(records, resolved);
  assert.equal(result.record.sdiDisplayed, 2.5);
  assert.equal(result.appliedTaxonRank, "GENUS");
  assert.equal(result.evidenceGapRecord.confidence, "insufficient");
});
