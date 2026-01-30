// @ts-check
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Cookie 持久化工具
 */

const COOKIE_PATH = join(process.cwd(), 'storage', 'cookies', 'auth.json');

/**
 * 保存浏览器上下文的认证状态
 * @param {import('@playwright/test').BrowserContext} context
 */
export async function saveCookies(context) {
  try {
    await context.storageState({ path: COOKIE_PATH });
    console.log(`[Cookie] 已保存到: ${COOKIE_PATH}`);
    return true;
  } catch (error) {
    console.error('[Cookie] 保存失败:', error.message);
    return false;
  }
}

/**
 * 检查是否存在已保存的 Cookie
 * @returns {boolean}
 */
export function hasSavedCookies() {
  return existsSync(COOKIE_PATH);
}

/**
 * 获取 Cookie 文件路径
 * @returns {string}
 */
export function getCookiePath() {
  return COOKIE_PATH;
}

/**
 * 加载已保存的认证状态创建浏览器上下文
 * @param {import('@playwright/test').Browser} browser
 * @returns {Promise<import('@playwright/test').BrowserContext>}
 */
export async function loadCookiesContext(browser) {
  if (!hasSavedCookies()) {
    throw new Error('未找到已保存的 Cookie 文件');
  }
  
  try {
    const context = await browser.newContext({
      storageState: COOKIE_PATH
    });
    console.log('[Cookie] 已从文件加载认证状态');
    return context;
  } catch (error) {
    console.error('[Cookie] 加载失败:', error.message);
    throw error;
  }
}
