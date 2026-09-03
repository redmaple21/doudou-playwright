// @ts-check
import sharp from 'sharp';
import { DdddOcr } from 'ddddocr-node';
import { info, warning } from './logger.js';
import {
  createOcrEngine,
  getCaptchaImageBufferFromSelectors,
  refreshCaptchaInBox,
  saveFailedCaptchaImage,
} from './captcha.js';

const CHECKIN_CAPTCHA_INPUT = '#checkin_captcha_code';
const CHECKIN_CAPTCHA_IMG = '#checkin-captcha-box img';
const CHECKIN_CAPTCHA_BOX = '#checkin-captcha-box';
const MAX_ATTEMPTS = 8;
const MATH_CHARSET = '0123456789+-xX*/=';

/**
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
 * @param {Buffer} buf
 * @returns {Promise<Record<string, Buffer>>}
 */
async function buildMathVariants(buf) {
  const resize = { width: 480, kernel: /** @type {const} */ ('nearest') };
  return {
    raw: buf,
    inv: await sharp(buf).negate().resize(resize).png().toBuffer(),
    t90: await sharp(buf).greyscale().normalize().negate().threshold(90).resize(resize).png().toBuffer(),
    t100: await sharp(buf).greyscale().normalize().negate().threshold(100).resize(resize).png().toBuffer(),
    t110: await sharp(buf).greyscale().normalize().negate().threshold(110).resize(resize).png().toBuffer(),
  };
}

/**
 * 从 OCR 文本中解析并计算算术表达式
 * @param {string} text
 * @returns {string | null}
 */
export function solveMathCaptchaText(text) {
  if (!text) return null;
  const normalized = String(text)
    .replace(/\s+/g, '')
    .replace(/[×✕✖]/g, 'x')
    .replace(/[÷]/g, '/')
    .replace(/[—–−]/g, '-');

  const match = normalized.match(/(\d{1,2})\s*([+\-xX*/])\s*(\d{1,2})/);
  if (!match) return null;

  const a = parseInt(match[1], 10);
  const op = match[2].toLowerCase();
  const b = parseInt(match[3], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;

  let result;
  switch (op) {
    case '+':
      result = a + b;
      break;
    case '-':
      result = a - b;
      break;
    case 'x':
    case '*':
      result = a * b;
      break;
    case '/':
      if (b === 0 || a % b !== 0) return null;
      result = a / b;
      break;
    default:
      return null;
  }

  if (!Number.isFinite(result) || result < 0 || result > 9999) return null;
  return String(result);
}

/**
 * @param {import('ddddocr-node').DdddOcr} ocr
 * @param {Buffer} image
 * @returns {Promise<string | null>}
 */
async function recognizeMathAnswer(ocr, image) {
  /** @type {import('ddddocr-node').DdddOcr} */
  const mathOcr = ocr;
  // 尽量使用含运算符的字符集；失败则回退原引擎
  try {
    mathOcr.setRanges(MATH_CHARSET);
  } catch {
    // ignore
  }

  const variants = await buildMathVariants(image);
  /** @type {string[]} */
  const candidates = [];

  for (const [name, buf] of Object.entries(variants)) {
    try {
      const raw = await mathOcr.classification(buf);
      info(`算术 OCR[${name}]: ${JSON.stringify(raw)}`);
      const answer = solveMathCaptchaText(raw);
      if (answer != null) {
        info(`解析表达式成功: ${raw} => ${answer}`);
        return answer;
      }
      if (raw) candidates.push(String(raw));
    } catch (err) {
      warning(`算术 OCR[${name}] 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  warning(`未能解析算术验证码，候选: ${JSON.stringify(candidates)}`);
  return null;
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
 * 填写并提交签到验证码（当前为算术题），成功则弹窗关闭
 * @param {import('@playwright/test').Page} page
 * @param {import('ddddocr-node').DdddOcr} [ocr]
 */
export async function completeCheckinCaptcha(page, ocr) {
  const engine = ocr || (await createOcrEngine({ charset: 'math' }));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    info(`签到验证码识别第 ${attempt}/${MAX_ATTEMPTS} 次`);
    await waitForCheckinCaptchaImage(page);

    const image = await getCaptchaImageBufferFromSelectors(page, CHECKIN_CAPTCHA_IMG, CHECKIN_CAPTCHA_BOX);
    const answer = await recognizeMathAnswer(engine, image);

    if (!answer) {
      warning('签到算术验证码 OCR 无效，刷新后重试');
      saveFailedCaptchaImage(image, 'checkin-captcha-last');
      await refreshCaptchaInBox(page, CHECKIN_CAPTCHA_BOX, CHECKIN_CAPTCHA_IMG);
      continue;
    }

    info(`使用签到答案: ${answer}`);
    await page.locator(CHECKIN_CAPTCHA_INPUT).fill(answer);
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
