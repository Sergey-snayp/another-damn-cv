/**
 * Loaded by test/run.cjs into every browser test (node --require). Chrome takes
 * ~4 s to start on a Mac (much longer when several start at once), so the
 * runner starts it once and each test opens its own private window in it (a
 * fresh browser context: no shared storage or cookies).
 *
 * The tests still call puppeteer.launch() and browser.close(); this swaps those
 * for "connect and open a context" and "close the context". A test that loads
 * the extension itself (enableExtensions) still gets its own Chrome. Run a test
 * file on its own (without the runner) and it launches Chrome as before.
 */
const path = require('node:path');

const endpoint = process.env.SHARED_CHROME_WS;
if (endpoint) {
  const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
  const ownLaunch = puppeteer.launch.bind(puppeteer);
  puppeteer.launch = async (options = {}) => {
    if (options.enableExtensions) return ownLaunch(options);
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, protocolTimeout: options.protocolTimeout });
    const context = await browser.createBrowserContext();
    // Stopped by the runner (over its time limit): close this test's window first, so its
    // pages stop running in the shared Chrome and slowing every other test.
    process.once('SIGTERM', () => { void context.close().catch(() => {}).finally(() => process.exit(1)); });
    return {
      // Several tests share the browser, but only one window can have focus: each page acts as if it had it.
      newPage: async () => {
        const page = await context.newPage();
        await page._client().send('Emulation.setFocusEmulationEnabled', { enabled: true });
        return page;
      },
      pages: () => context.pages(),
      targets: () => browser.targets().filter((target) => target.browserContext() === context),
      waitForTarget: (predicate, options) => browser.waitForTarget((target) => target.browserContext() === context && predicate(target), options),
      process: () => null,
      close: async () => {
        await context.close().catch(() => {});
        await browser.disconnect();
      },
    };
  };
}
