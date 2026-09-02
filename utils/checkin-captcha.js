// @ts-check
import { info, warning } from './logger.js';
import {
  createOcrEngine,
  recognizeCaptchaInBox,
  refreshCaptchaInBox,
} from './captcha.js';

const CHECKIN_CAPTCHA_INPUT = '#checkin_captcha_code';
const CHECKIN_CAPTCHA_IMG = '#checkin-captcha-box img';
const CHECKIN_CAPTCHA_BOX = '#checkin-captcha-box';
const MAX_ATTEMPTS = 8;

/**
 * 签到验证码弹窗是否已打开
 * @param {import('@playwright/test').Page} page
 */
export async function isCheckinCaptchaDialogVisible(page) {
  return page.getByText('签到验证').isVisible().catch(() => false);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function waitForCheckinCaptchaImage(page) {
  await page.locator(CHECKIN_CAPTCHA_IMG).waitFor({ state: 'visible', timeout: 10000 });
  await page
    .waitForFunction(() => {
      const el = document.querySelector('#checkin-captcha-box img');
      const src = el?.getAttribute('src') || '';
      return src.startsWith('data:image') && src.length > 1000;
    }, undefined, { timeout: 10000 })
    .catch(() => {});
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function submitCheckinCaptcha(page) {
  const clicked = await page.evaluate(() => {
    const input = document.querySelector('#checkin_captcha_code');
    if (!input) return false;

    let root = input.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const candidates = Array.from(root.querySelectorAll('button, div, span, a'));
      const confirm = candidates.find((el) => {
        const text = (el.textContent || '').trim();
        return text === '确认' && el.offsetParent !== null;
      });
      if (confirm) {
        confirm.click();
        return true;
      }
      root = root.parentElement;
    }
    return false;
  });

  if (!clicked) {
    await page.locator(CHECKIN_CAPTCHA_INPUT).press('Enter');
  }
}

/**
 * 填写并提交签到验证码，成功则弹窗关闭
 * @param {import('@playwright/test').Page} page
 * @param {import('ddddocr-node').DdddOcr} [ocr]
 */
export async function completeCheckinCaptcha(page, ocr) {
  const engine = ocr || (await createOcrEngine());

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    info(`签到验证码识别第 ${attempt}/${MAX_ATTEMPTS} 次`);
    await waitForCheckinCaptchaImage(page);

    const code = await recognizeCaptchaInBox(page, engine, CHECKIN_CAPTCHA_IMG, CHECKIN_CAPTCHA_BOX);
    if (!code) {
      warning('签到验证码 OCR 无效，刷新后重试');
      await refreshCaptchaInBox(page, CHECKIN_CAPTCHA_BOX, CHECKIN_CAPTCHA_IMG);
      continue;
    }

    info(`使用签到验证码: ${code}`);
    await page.locator(CHECKIN_CAPTCHA_INPUT).fill(code);
    await submitCheckinCaptcha(page);

    const dialogClosed = await page
      .getByText('签到验证')
      .waitFor({ state: 'hidden', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (dialogClosed) {
      info('签到验证码已通过');
      return;
    }

    warning('签到验证码可能错误，刷新后重试');
    await refreshCaptchaInBox(page, CHECKIN_CAPTCHA_BOX, CHECKIN_CAPTCHA_IMG);
  }

  throw new Error(`签到验证码识别失败，已重试 ${MAX_ATTEMPTS} 次`);
}
