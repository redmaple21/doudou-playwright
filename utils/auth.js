// @ts-check
import dotenv from 'dotenv';
import { join } from 'path';
import { info, success, warning } from './logger.js';
import {
  createOcrEngine,
  recognizeCaptcha,
  refreshCaptcha,
} from './captcha.js';

// 加载环境变量
dotenv.config({ path: join(process.cwd(), 'config', '.env') });

const MAX_CAPTCHA_ATTEMPTS = 8;

/**
 * 认证相关工具函数
 */

/**
 * 获取配置项
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
function getConfig(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

/**
 * 获取目标网站URL
 * @returns {string}
 */
export function getTargetUrl() {
  return getConfig('TARGET_URL', 'https://example.com');
}

/**
 * 获取登录页面URL
 * @returns {string}
 */
export function getLoginUrl() {
  return getConfig('LOGIN_URL', getTargetUrl());
}

/**
 * 获取签到页面URL
 * @returns {string}
 */
export function getSigninUrl() {
  return getConfig('SIGNIN_URL', getTargetUrl());
}

/**
 * 获取用户名/邮箱
 * @returns {string}
 */
export function getUsername() {
  return getConfig('LOGIN_EMAIL');
}

/**
 * 获取密码
 * @returns {string}
 */
export function getPassword() {
  return getConfig('LOGIN_PASSWORD');
}

/**
 * 获取是否无头模式
 * @returns {boolean}
 */
export function isHeadless() {
  return getConfig('HEADLESS', 'false') === 'true';
}

/**
 * 获取超时时间
 * @returns {number}
 */
export function getTimeout() {
  return parseInt(getConfig('TIMEOUT', '30000'));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} username
 * @param {string} password
 */
async function fillCredentials(page, username, password) {
  await page.locator('#email2').fill(username);
  await page.getByRole('textbox', { name: '密码' }).fill(password);
}

/**
 * 执行登录操作（含 4 位数字验证码 OCR）
 * @param {import('@playwright/test').Page} page
 */
export async function performLogin(page) {
  const username = getUsername();
  const password = getPassword();

  if (!username || !password) {
    throw new Error('未配置用户名或密码，请检查 .env 文件');
  }

  info('开始填写登录表单...');
  await fillCredentials(page, username, password);
  info('已填写用户名和密码');

  const captchaInput = page.getByRole('textbox', { name: '验证码' });
  const captchaVisible = await captchaInput.isVisible().catch(() => false);
  const loginButton = page.getByRole('button', { name: /登[录錄]/ });

  if (!captchaVisible) {
    await loginButton.click();
    info('已点击登录按钮');
    await page.waitForLoadState('networkidle');
    info('页面加载完成');
    return;
  }

  const override = getConfig('LOGIN_CAPTCHA');
  /** @type {import('ddddocr-node').DdddOcr | null} */
  let ocr = null;

  if (!override) {
    ocr = await createOcrEngine();
  }

  for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
    info(`验证码识别第 ${attempt}/${MAX_CAPTCHA_ATTEMPTS} 次`);

    let code = override;
    if (!code && ocr) {
      code = (await recognizeCaptcha(page, ocr)) || '';
    }

    if (!code) {
      warning('未得到 4 位数字，刷新验证码');
      await refreshCaptcha(page);
      continue;
    }

    info(`使用验证码: ${code}`);
    await captchaInput.fill(code);
    await loginButton.click();
    info('已点击登录按钮');

    const loggedIn = await page
      .locator('a:has-text("控制面板")')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (loggedIn) {
      success('登录成功');
      await page.waitForLoadState('networkidle').catch(() => {});
      return;
    }

    warning('登录未成功，可能验证码错误');
    if (override) {
      throw new Error('LOGIN_CAPTCHA 填写后登录失败');
    }

    await fillCredentials(page, username, password);
    await page.waitForTimeout(400);
    await refreshCaptcha(page);
  }

  throw new Error(`验证码 OCR 登录失败，已重试 ${MAX_CAPTCHA_ATTEMPTS} 次`);
}
