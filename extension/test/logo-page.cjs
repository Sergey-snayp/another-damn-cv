const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// The logo on real addresses (test/logo.html's frames have none): structured data
// without a logo is not the page itself, and a wide logo on the company's own site
// gives way to its square icon. Synthetic pages, as on Orderful's careers page.
const site = 'https://careers.acme.example';
const wordmark = '<img src="https://careers.acme.example/_next/image?url=wordmark.svg" alt="Acme" width="136" height="21">';
const website = '<script type="application/ld+json">{"@type":"WebSite","name":"Acme"}</script>';
const pages = {
  [`${site}/data`]: `<!doctype html>${website}<p>Careers</p>`,
  [`${site}/wide`]: `<!doctype html>${website}<nav>${wordmark}</nav>`,
  [`${site}/icon`]: `<!doctype html><link rel="icon" sizes="192x192" href="/icon.png"><nav>${wordmark}</nav>`,
  [`${site}/square`]: `<!doctype html>${website}<nav><img src="${site}/mark.png" alt="Acme" width="64" height="64"></nav>`,
  'https://jobs.lever.co/acme/1': `<!doctype html><nav><img src="https://cdn.example/acme.png" alt="Acme" width="136" height="21"></nav>`,
};
const expected = {
  [`${site}/data`]: { logo: null, domain: 'acme.example' },
  [`${site}/wide`]: { logo: null, domain: 'acme.example' },
  [`${site}/icon`]: { logo: `${site}/icon.png`, domain: 'acme.example' },
  [`${site}/square`]: { logo: `${site}/mark.png`, domain: 'acme.example' },
  'https://jobs.lever.co/acme/1': { logo: 'https://cdn.example/acme.png', domain: null },
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await pageWithScripts(browser, pages);
    for (const [address, want] of Object.entries(expected)) {
      await page.open(address);
      assert.deepEqual(await page.evaluate(() => window.CVAutofillLogo.find('Acme')), want, address);
    }
    console.log('PASS the page itself is never the logo, and a wide logo on the company’s own site gives way to its icon');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
