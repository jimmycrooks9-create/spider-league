import test from "node:test";
import assert from "node:assert/strict";
import { rankSubmissions, sortSubmissions } from "../league-core.js";

const at = (date) => new Date(`${date}T12:00:00Z`);

test("sorts by SDI descending and earlier observation first", () => {
  const sorted = sortSubmissions([
    { id: "a", sdi: 3, observedAt: at("2026-06-20") },
    { id: "b", sdi: 5, observedAt: at("2026-06-22") },
    { id: "c", sdi: 5, observedAt: at("2026-06-18") }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["c", "b", "a"]);
});

test("equal scores share competition rank", () => {
  const ranked = rankSubmissions([
    { id: "a", sdi: 5, observedAt: at("2026-06-18") },
    { id: "b", sdi: 5, observedAt: at("2026-06-19") },
    { id: "c", sdi: 3.5, observedAt: at("2026-06-20") }
  ]);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 1, 3]);
});
