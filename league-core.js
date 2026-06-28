function timestampMillis(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function sortSubmissions(submissions) {
  return [...submissions].sort((a, b) => {
    const scoreDifference = Number(b.sdi) - Number(a.sdi);
    if (scoreDifference !== 0) return scoreDifference;

    const observedDifference =
      timestampMillis(a.observedAt) - timestampMillis(b.observedAt);
    if (observedDifference !== 0) return observedDifference;

    return timestampMillis(a.createdAt) - timestampMillis(b.createdAt);
  });
}

export function rankSubmissions(submissions) {
  const sorted = sortSubmissions(submissions);
  let lastScore = null;
  let lastRank = 0;

  return sorted.map((submission, index) => {
    const score = Number(submission.sdi);
    const sameScore = lastScore !== null && Math.abs(score - lastScore) < 1e-9;
    const rank = sameScore ? lastRank : index + 1;
    lastScore = score;
    lastRank = rank;
    return { ...submission, rank };
  });
}

export function dateFromTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
