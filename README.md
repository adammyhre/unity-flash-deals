# Unity Flash Deals

Playwright TypeScript scraper for [Unity Asset Store](https://assetstore.unity.com/) flash deals. It signs in with your Unity ID (optional session reuse), walks the flash deals listing with pagination, skips assets you already own, and writes matching deals to the console and `results.json`.

<img width="3284" height="579" alt="image" src="https://github.com/user-attachments/assets/b1409dfd-6a97-49d5-918d-abecc03c4eb5" />

## Features

- Scrapes the flash deals listing with automatic pagination (up to 50 pages)
- Configurable minimum discount threshold (`config.json` and `--minDiscount`)
- Unity ID sign-in using credentials from `config.json`
- Session persistence via `storage-state.json` (skip login on later runs)
- Filters out owned assets (`You own this asset` / `product-card-purchased-label`)
- Opens each matching deal and checks wishlist heart state; wishlist hits sort first
- Console table output plus structured `results.json`
- CLI flags for headless/headed mode, slow motion, login/wishlist control, and help

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (ESM / TypeScript via `tsx`)
- npm
- Chromium for Playwright (installed via the setup step below)

## Setup

```bash
npm install
npx playwright install chromium
cp config.example.json config.json
```

Edit `config.json` with your Unity Asset Store credentials and preferred defaults. Do not commit `config.json` — it is gitignored.

## Configuration

Copy `config.example.json` to `config.json`:

| Field | Description | Default |
| --- | --- | --- |
| `email` | Unity ID email | *(required for login)* |
| `password` | Unity ID password | *(required for login)* |
| `minDiscountPercent` | Minimum discount % to include | `70` |
| `flashDealsUrl` | Listing URL to scrape | flash deals filter URL |
| `headless` | Run browser without UI | `false` |
| `slowMo` | Delay between Playwright actions (ms) | `0` |

CLI flags override the corresponding config values when provided.

**Gitignored local files:** `config.json`, `storage-state.json`, `results.json`

## CLI options

```text
Usage: npm start -- [options]

Options:
  --headless              Run browser without UI (default: from config)
  --headed                Force headed mode
  --slowMo <ms>           Delay between Playwright actions in ms
  --minDiscount <n>       Minimum discount percent (e.g. 70)
  --skip-login            Reuse storage-state.json; do not open login flow
  --login, --force-login  Force a fresh Unity ID sign-in
  --skip-wishlist         Do not open each deal to check wishlist status
  -h, --help              Show this help
```

Aliases: `--slow-mo` / `--slowMo`, `--min-discount` / `--minDiscount`. Values may be passed as `--slowMo 250` or `--slowMo=250`.

## Usage examples

```bash
# Default run (config.json settings; headed unless config says otherwise)
npm start

# Headless scrape
npm start -- --headless

# Slow motion for debugging the browser UI
npm start -- --slowMo 250

# Only deals at 50%+ off, headed browser
npm start -- --minDiscount 50 --headed

# Reuse saved session; never open the login flow
npm start -- --skip-login --headless

# Force a fresh Unity ID sign-in (ignore / refresh session)
npm start -- --force-login

# Listing only (skip per-deal wishlist page visits)
npm start -- --skip-wishlist --headless

# Show help
npm start -- --help
```

`npm run scrape` is equivalent to `npm start`.

## Auth and session

1. On first run (or with `--force-login` / `--login`), the scraper opens the Asset Store, starts Unity ID login, and fills email/password from `config.json`.
2. After a successful sign-in, cookies are saved to `storage-state.json`.
3. Later runs load that file when present. The scraper checks whether you still appear signed in; if the session expired, it signs in again and rewrites the session file.
4. `--skip-login` always reuses `storage-state.json` when it exists and never opens the login flow. If the file is missing, the run continues signed out (owned-asset filtering will not work).
5. After a successful scrape (unless `--skip-login`), the session file is refreshed.

Placeholder credentials (e.g. `example.com` emails) are rejected so you do not accidentally run with the template values.

## Output

Matching deals (discount ≥ `minDiscountPercent`, excluding owned when signed in) are:

1. Checked for wishlist status on each product page (unless `--skip-wishlist`)
2. Sorted by wishlist first, then discount % (desc), then publisher / name
3. Printed as a console table (`wishlist`, `publisher`, `name`, `price`, `discount`, `url`)
4. Written to `results.json` in the project root

Wishlist detection uses `[data-test="saved-list-icon"]`:
- on wishlist → `.ifont-favorite` (filled heart)
- not on wishlist → `.ifont-favorite-border` (outline)

Example `results.json` shape:

```json
{
  "scrapedAt": "2026-08-13T06:00:00.000Z",
  "minDiscountPercent": 70,
  "signedIn": true,
  "wishlistChecked": true,
  "wishlistCount": 1,
  "count": 2,
  "deals": [
    {
      "onWishlist": true,
      "publisher": "Example Studio",
      "name": "Example Asset",
      "price": "$9.99",
      "discount": "80%",
      "url": "https://assetstore.unity.com/packages/..."
    }
  ]
}
```

Owned assets are detected via the `product-card-purchased-label` marker or the text “You own this asset” on product cards.

## Project structure

```text
unity-flash-deals/
├── config.example.json   # Template for local config
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry: browser, auth, scrape, output
│   ├── config.ts         # Load config.json + CLI overrides
│   ├── auth.ts           # Sign-in, cookie banner, session persist
│   ├── scrape.ts         # Listing scrape + pagination
│   ├── wishlist.ts       # Per-deal wishlist heart check
│   └── types.ts          # Deal / page result types
└── scripts/              # Ad-hoc discovery helpers (not part of npm start)
```

Local-only (gitignored): `config.json`, `storage-state.json`, `results.json`.

## Troubleshooting

| Issue | What to try |
| --- | --- |
| Login fails / still signed out | Run headed (`--headed`) and watch the Unity ID flow; confirm `config.json` email/password; use `--force-login` |
| Cookie / consent banner blocks clicks | The scraper clicks OneTrust accept when visible; retry headed if the site UI changed |
| No deals / empty results | Lower `--minDiscount`; confirm flash deals are live; check that `flashDealsUrl` still has the sale filters |
| Owned assets still appear | You must be signed in; without a valid session, ownership labels are not available |
| Wishlist always empty / wrong | Must be signed in; confirm heart control still uses `saved-list-icon` / `ifont-favorite*` |
| Session ignored | Delete `storage-state.json` and sign in again, or pass `--force-login` |
| Timeout waiting for cards | Network or SPA load; try `--slowMo 100`, headed mode, or a longer wait on a slower connection |
| `Unknown argument` | Use `--help`; option names are case-sensitive (`--minDiscount`, not `--mindiscount`) |

## License

Copyright (c) 2026 Git Amend. MIT — see [LICENSE](LICENSE).
