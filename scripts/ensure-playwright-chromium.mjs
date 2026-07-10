/** Sai 0 se Chromium do Playwright estiver instalado; 1 se faltar. */
import { chromium } from "playwright";

try {
  const b = await chromium.launch({ headless: true });
  await b.close();
} catch {
  process.exit(1);
}
