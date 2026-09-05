// @ts-check
/**
 * 降低 Playwright 自动化特征，降低被站点脚本检测命中的概率。
 * 不能保证绕过所有风控，但能处理常见的 navigator.webdriver 等前端检测。
 */

const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch {}

  if (!window.chrome) {
    window.chrome = { runtime: {} };
  }

  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    });
  } catch {}

  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  } catch {}

  const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) => (
      parameters && parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters)
    );
  }
})();
`;

/**
 * 创建带基础反检测配置的 BrowserContext
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').BrowserContextOptions} [options]
 */
export async function createStealthContext(browser, options = {}) {
  const context = await browser.newContext({
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1365, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ...options,
  });
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  return context;
}

/**
 * 模拟更接近人工的短暂停顿
 * @param {import('@playwright/test').Page} page
 * @param {number} [minMs]
 * @param {number} [maxMs]
 */
export async function humanPause(page, minMs = 400, maxMs = 1200) {
  const ms = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
  await page.waitForTimeout(ms);
}

/**
 * 先移动到元素再点击，减少“瞬点”特征
 * @param {import('@playwright/test').Locator} locator
 */
export async function humanClick(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.hover({ timeout: 5000 }).catch(() => {});
  await locator.page().waitForTimeout(200 + Math.floor(Math.random() * 400));
  await locator.click();
}
