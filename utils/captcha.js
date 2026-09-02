// @ts-check
import { copyFileSync, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, sep } from 'path';
import { pipeline } from 'stream/promises';
import { DdddOcr, CHARSET_RANGE } from 'ddddocr-node';
import { info, warning } from './logger.js';

const LOGIN_CAPTCHA_IMG = '#login-captcha-box img';
const LOGIN_CAPTCHA_BOX = '#login-captcha-box';
const DEBUG_DIR = join(process.cwd(), 'storage', 'screenshots');
const ONNX_DIR = join(process.cwd(), 'storage', 'onnx');
const MODEL_NAME = 'common_old.onnx';
const CHARSET_NAME = 'common_old.json';
const MODEL_URL =
  process.env.DDDDOCR_MODEL_URL ||
  'https://github.com/yangbin1322/go-ddddocr/releases/download/v1.0.1/common_old.onnx';

/**
 * 确保 ddddocr 默认模型存在（npm 包里的 onnx 是 Git LFS 指针，不能直接用）
 */
async function ensureOcrModel() {
  mkdirSync(ONNX_DIR, { recursive: true });

  const charsetSrc = join(process.cwd(), 'node_modules', 'ddddocr-node', 'onnx', CHARSET_NAME);
  const charsetDest = join(ONNX_DIR, CHARSET_NAME);
  if (existsSync(charsetSrc)) {
    copyFileSync(charsetSrc, charsetDest);
  }

  const modelDest = join(ONNX_DIR, MODEL_NAME);
  if (existsSync(modelDest) && statSync(modelDest).size > 1_000_000) {
    return;
  }

  info(`正在下载 OCR 模型: ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`下载 OCR 模型失败: HTTP ${res.status}`);
  }

  const tmp = `${modelDest}.tmp`;
  await pipeline(res.body, createWriteStream(tmp));
  const size = statSync(tmp).size;
  if (size < 1_000_000) {
    unlinkSync(tmp);
    throw new Error(`OCR 模型文件异常，大小仅 ${size} 字节`);
  }
  if (existsSync(modelDest)) unlinkSync(modelDest);
  renameSync(tmp, modelDest);
  info(`OCR 模型已保存 (${size} 字节)`);
}

/**
 * @returns {Promise<import('ddddocr-node').DdddOcr>}
 */
export async function createOcrEngine() {
  await ensureOcrModel();
  info('正在加载 OCR 引擎（ddddocr）...');
  const ocr = new DdddOcr();
  ocr.setPath(ONNX_DIR + sep);
  ocr.setRanges(CHARSET_RANGE.NUM_CASE);
  ocr.setLogSeverityLevel(4);
  info('OCR 引擎已就绪');
  return ocr;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function parseOcrDigits(text) {
  const digits = (text || '').replace(/\D/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} imgSelector
 * @param {string} boxSelector
 * @returns {Promise<Buffer>}
 */
async function getCaptchaImageBuffer(page, imgSelector, boxSelector) {
  const img = page.locator(imgSelector);
  await img.waitFor({ state: 'visible', timeout: 10000 });
  await page
    .waitForFunction(
      ([imgSel, boxSel]) => {
        const el = document.querySelector(imgSel) || document.querySelector(`${boxSel} img`);
        const src = el?.getAttribute('src') || '';
        return src.startsWith('data:image') && src.length > 1000;
      },
      [imgSelector, boxSelector],
      { timeout: 8000 }
    )
    .catch(() => {});

  const src = await img.getAttribute('src');
  if (src && src.startsWith('data:image')) {
    const base64 = src.split(',')[1];
    if (base64 && base64.length > 100) {
      return Buffer.from(base64, 'base64');
    }
  }

  return img.screenshot();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} boxSelector
 * @param {string} imgSelector
 */
export async function refreshCaptchaInBox(page, boxSelector, imgSelector) {
  const img = page.locator(imgSelector);
  const prevSrc = await img.getAttribute('src').catch(() => null);
  await page.locator(boxSelector).click();
  await page
    .waitForFunction(
      ([prev, imgSel, boxSel]) => {
        const el = document.querySelector(imgSel) || document.querySelector(`${boxSel} img`);
        const src = el?.getAttribute('src') || '';
        return src.startsWith('data:image') && src.length > 1000 && src !== prev;
      },
      [prevSrc, imgSelector, boxSelector],
      { timeout: 8000 }
    )
    .catch(() => {
      warning('等待验证码刷新超时，继续尝试');
    });
  await page.waitForTimeout(300);
}

/**
 * @param {Buffer} original
 * @param {string} label
 */
function saveFailedCaptcha(original, label = 'captcha-last') {
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    writeFileSync(join(DEBUG_DIR, `${label}.png`), original);
  } catch {
    // 调试图写入失败不影响流程
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('ddddocr-node').DdddOcr} ocr
 * @param {string} imgSelector
 * @param {string} boxSelector
 * @param {string} [debugLabel]
 * @returns {Promise<string | null>}
 */
export async function recognizeCaptchaInBox(page, ocr, imgSelector, boxSelector, debugLabel = 'captcha-last') {
  const original = await getCaptchaImageBuffer(page, imgSelector, boxSelector);
  const rawText = await ocr.classification(original);
  const code = parseOcrDigits(rawText);
  info(`OCR 原始输出: ${JSON.stringify(rawText)}`);
  if (!code) {
    warning(`OCR 结果无效: ${JSON.stringify((rawText || '').trim())}`);
    saveFailedCaptcha(original, debugLabel);
  }
  return code;
}

/**
 * 识别登录页验证码
 * @param {import('@playwright/test').Page} page
 * @param {import('ddddocr-node').DdddOcr} ocr
 */
export async function recognizeCaptcha(page, ocr) {
  return recognizeCaptchaInBox(page, ocr, LOGIN_CAPTCHA_IMG, LOGIN_CAPTCHA_BOX);
}

/**
 * 刷新登录页验证码
 * @param {import('@playwright/test').Page} page
 */
export async function refreshCaptcha(page) {
  return refreshCaptchaInBox(page, LOGIN_CAPTCHA_BOX, LOGIN_CAPTCHA_IMG);
}
