import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  email: string;
  password: string;
  minDiscountPercent: number;
  flashDealsUrl: string;
  headless: boolean;
  slowMo: number;
  /** Reuse storage-state.json and skip interactive login when possible */
  skipLogin: boolean;
  /** Force a fresh login even if a stored session exists */
  forceLogin: boolean;
  /** Skip opening each deal to check wishlist status */
  skipWishlist: boolean;
}

export type CliOverrides = Partial<AppConfig> & { help?: boolean };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function parseArgs(argv: string[]): CliOverrides {
  const out: CliOverrides = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }

    if (arg === "--headless") {
      out.headless = true;
      continue;
    }

    if (arg === "--headed") {
      out.headless = false;
      continue;
    }

    if (arg === "--skip-login") {
      out.skipLogin = true;
      continue;
    }

    if (arg === "--login" || arg === "--force-login") {
      out.forceLogin = true;
      continue;
    }

    if (arg === "--skip-wishlist") {
      out.skipWishlist = true;
      continue;
    }

    if (arg === "--slowMo" || arg === "--slow-mo") {
      const value = argv[++i];
      if (value === undefined || Number.isNaN(Number(value))) {
        throw new Error(`Expected a number after ${arg}`);
      }
      out.slowMo = Number(value);
      continue;
    }

    if (arg.startsWith("--slowMo=") || arg.startsWith("--slow-mo=")) {
      const value = arg.split("=")[1];
      if (value === undefined || Number.isNaN(Number(value))) {
        throw new Error(`Expected a number for ${arg}`);
      }
      out.slowMo = Number(value);
      continue;
    }

    if (arg === "--minDiscount" || arg === "--min-discount") {
      const value = argv[++i];
      if (value === undefined || Number.isNaN(Number(value))) {
        throw new Error(`Expected a number after ${arg}`);
      }
      out.minDiscountPercent = Number(value);
      continue;
    }

    if (arg.startsWith("--minDiscount=") || arg.startsWith("--min-discount=")) {
      const value = arg.split("=")[1];
      if (value === undefined || Number.isNaN(Number(value))) {
        throw new Error(`Expected a number for ${arg}`);
      }
      out.minDiscountPercent = Number(value);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

export function printHelp(): void {
  console.log(`Usage: npm start -- [options]

Options:
  --headless              Run browser without UI (default: from config)
  --headed                Force headed mode
  --slowMo <ms>           Delay between Playwright actions in ms
  --minDiscount <n>       Minimum discount percent (e.g. 70)
  --skip-login            Reuse storage-state.json; do not open login flow
  --login, --force-login  Force a fresh Unity ID sign-in
  --skip-wishlist         Do not open each deal to check wishlist status
  -h, --help              Show this help

Config file: config.json (see config.example.json)
Session file: storage-state.json (gitignored)
`);
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  const cli = parseArgs(argv);
  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  const configPath = resolve(ROOT, "config.json");
  let fileConfig: Partial<AppConfig> = {};

  try {
    fileConfig = JSON.parse(readFileSync(configPath, "utf8")) as Partial<AppConfig>;
  } catch {
    console.warn(
      `No config.json found at ${configPath}. Copy config.example.json and fill in credentials.`
    );
  }

  return {
    email: fileConfig.email ?? "",
    password: fileConfig.password ?? "",
    minDiscountPercent: cli.minDiscountPercent ?? fileConfig.minDiscountPercent ?? 70,
    flashDealsUrl:
      fileConfig.flashDealsUrl ??
      "https://assetstore.unity.com/listing#f-ec_sale_filters=on_sale,flash_deal",
    headless: cli.headless ?? fileConfig.headless ?? false,
    slowMo: cli.slowMo ?? fileConfig.slowMo ?? 0,
    skipLogin: cli.skipLogin ?? false,
    forceLogin: cli.forceLogin ?? false,
    skipWishlist: cli.skipWishlist ?? false,
  };
}
