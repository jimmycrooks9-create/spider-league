# Spider League SDI — version 0.4

A free static progressive web app for resolving a spider name and returning the closest evidence-supported Spider Danger Index (SDI).

## Lookup flow

1. Curated aliases handle common names and spelling variants.
2. iNaturalist autocomplete proposes spider taxa for other common or scientific names.
3. GBIF Catalogue of Life XR validates the accepted scientific name and classification.
4. The SDI engine applies the closest supported record: species → genus → family → general baseline.
5. The interface discloses the applied taxon, confidence, evidence gap, and independent safety warning.

## Version 0.5 additions

- Shareable result links that reopen the exact taxon.
- Evidence coverage page with direct scores, evidence gaps, and an Oregon-focused research queue.
- Broader offline common-name coverage for common Oregon spider groups.
- Pacific Northwest evidence records for yellow sac spiders, cross orbweavers, and Agelenidae.
- Explicit sparse-evidence records for hobo, giant house, western black widow, and bold jumping spiders.
- Automated data-integrity validation.
- Automated GitHub Pages deployment after every successful test run.
- Offline taxonomy snapshots for every curated alias.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Validate and test

```bash
npm run check
```

No package installation is required; the project has no runtime or test dependencies.

## Publish free with GitHub Pages

1. Create a public GitHub repository.
2. Upload the contents of this folder—not the enclosing ZIP.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push to `main`. The included workflow validates, tests, and deploys the app automatically.

## Current boundary

The taxonomy lookup can resolve far more spiders than the medical-evidence database can score directly. Unsupported taxa receive a visibly labeled taxonomic fallback. The general 2.5 fallback is a methodological baseline, not a worldwide measured average.

## Cohort-table approximation

When a qualifying cohort reports severe-pain and systemic-effect percentages without their overlap, the database uses `2.5 + 2 × max(severe-pain rate, systemic-effects rate)`. This conservative approximation avoids double-counting patients and is always disclosed in the evidence record.

## Diagnostics

Open `diagnostics.html` after deployment to test bundled data, iNaturalist common-name discovery, GBIF/Catalogue of Life validation, and install/offline support in the browser actually running the app.


## Official league submissions (v0.7)

This release adds:

- `league.html` — public ranked standings
- `admin.html` — authenticated official-submission form and delete controls
- `firebase-config.js` — Firebase project connection
- `firestore.rules` — public-read/admin-write security rules
- `FIREBASE_SETUP.md` — exact no-cost setup steps

The submission form stores only the observer name, observation date, resolved spider, SDI score snapshot, and evidence metadata. It does not collect photos, locations, or notes.

Follow `FIREBASE_SETUP.md` after uploading this release to GitHub Pages.
