/**
 * Loaded by test/run.cjs into every test (node --require). Chrome takes ~4 s to
 * start on a Mac, so the runner starts it once and each test opens its own
 * private window in it (a fresh browser context: no shared storage or cookies).
 *
 * The tests still call puppeteer.launch() and browser.close(); this swaps those
 * for "connect and open a context" and "close the context". Run a test file on
 * its own (without the runner) and it launches Chrome as before.
 */
const path = require('node:path');

const endpoint = process.env.SHARED_CHROME_WS;
if (endpoint) {
  const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
  puppeteer.launch = async () => {
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    const context = await browser.createBrowserContext();
    return {
      // Several tests share the browser, but only one window can have focus: each page acts as if it had it.
      newPage: async () => {
        const page = await context.newPage();
        await page._client().send('Emulation.setFocusEmulationEnabled', { enabled: true });
        return page;
      },
      pages: () => context.pages(),
      process: () => null,
      close: async () => {
        await context.close().catch(() => {});
        await browser.disconnect();
      },
    };
  };
}
