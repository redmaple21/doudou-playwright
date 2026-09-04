// @ts-check
import { test } from '@playwright/test';
import { getLoginUrl, getSigninUrl, performLogin } from '../utils/auth.js';
import { hasSavedCookies, getCookiePath, saveCookies } from '../utils/cookie.js';
import { info, success, error, warning } from '../utils/logger.js';
import { notifySigninSuccess, notifySigninFailure, notifyAlreadySigned } from '../utils/notifier.js';
import { createOcrEngine } from '../utils/captcha.js';
import { completeCheckinCaptcha } from '../utils/checkin-captcha.js';

/**
 * @param {import('@playwright/test').Response} resp
 */
function isLikelyCheckinResponse(resp) {
  if (resp.status() !== 200) return false;
  const url = resp.url();
  const method = resp.request().method();
  if (/\.(js|css|png|jpg|ico|woff2?|svg)(\?|$)/i.test(url)) return false;
  if (/\/auth\/captcha/i.test(url)) return false;
  const apiPattern = process.env.SIGNIN_API_URL_PATTERN || '';
  if (apiPattern) return url.includes(apiPattern);
  return /checkin|signin|qiandao|续命/i.test(url) || method === 'POST';
}

/**
 * @param {import('@playwright/test').Response | null} resp
 */
async function readSigninResponse(resp) {
  if (!resp) return null;
  try {
    const contentType = resp.headers()['content-type'] || '';
    return contentType.includes('application/json')
      ? await resp.json()
      : await resp.text();
  } catch {
    return (await resp.text().catch(() => null));
  }
}

/**
 * 从签到成功弹窗中提取奖励文案（接口未捕获时的兜底）
 * @param {import('@playwright/test').Page} page
 */
async function extractSuccessDialogMessage(page) {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      /好的，我知道了|知道了/.test((el.textContent || '').trim())
    );
    if (!btn) return '';

    let root = btn.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const text = (root.innerText || '').replace(/\s+/g, ' ').trim();
      if (text && /流量|豆丁|GB|MB|续命|天|小时/.test(text)) {
        return text
          .replace(/好的，我知道了|知道了/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      root = root.parentElement;
    }

    const candidates = Array.from(document.querySelectorAll('.swal2-html-container, .swal2-content, .modal-body, [class*="dialog"], [class*="toast"]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && /流量|豆丁|GB|MB|续命|天|小时/.test(t));
    return candidates[0] || '';
  }).catch(() => '');
}

/**
 * 将签到接口返回格式化为可读文案（避免 \uXXXX 在微信里不可读）
 * @param {object|string|null} signinData - 接口返回的 JSON 对象或字符串
 * @param {string} [dialogMessage] - 成功弹窗文案兜底
 * @returns {string} 用于通知的文案
 */
function formatSigninMessage(signinData, dialogMessage = '') {
  if (signinData == null) {
    return dialogMessage ? `✅ 签到成功\n${dialogMessage}` : '✅ 签到成功';
  }
  let obj = signinData;
  if (typeof signinData === 'string') {
    try {
      obj = JSON.parse(signinData);
    } catch {
      return '✅ 签到成功\n' + signinData;
    }
  }
  if (obj && typeof obj.msg === 'string' && obj.msg.trim()) {
    return `✅ 签到成功\n${obj.msg}`;
  }
  if (obj && typeof obj === 'object' && obj.msg !== undefined && String(obj.msg).trim()) {
    return '✅ 签到成功\n' + String(obj.msg);
  }
  if (dialogMessage) {
    return `✅ 签到成功\n${dialogMessage}`;
  }
  return '✅ 签到成功';
}

/**
 * 关闭进入控制面板后可能出现的公告弹窗
 * @param {import('@playwright/test').Page} page
 */
async function dismissNoticeDialogIfPresent(page) {
  const noticeButton = page.getByRole('button', { name: /好的，我知道了|知道了/ });
  try {
    await noticeButton.first().waitFor({ state: 'visible', timeout: 3000 });
    info('关闭公告弹窗');
    await noticeButton.first().click();
    await page.waitForTimeout(500);
  } catch {
    info('未检测到公告弹窗，继续执行');
  }
}

/**
 * 自动签到完整流程
 * 
 * 流程：
 * 1. 检查是否有有效的Cookie
 * 2. 如果有Cookie，尝试直接签到
 * 3. 如果Cookie失效或没有Cookie，先登录
 * 4. 登录成功后保存Cookie
 * 5. 执行签到
 * 6. 记录日志和截图
 */

test('自动签到完整流程', async ({ browser }) => {
  info('========================================');
  info('开始执行自动签到任务');
  info('========================================');
  
  let context;
  let needLogin = true;
  
  try {
    // 步骤1: 检查Cookie
    if (hasSavedCookies()) {
      info('发现已保存的Cookie，尝试使用Cookie登录');
      try {
        context = await browser.newContext({
          storageState: getCookiePath()
        });
        const page = await context.newPage();
        await page.goto(getSigninUrl());
        await page.waitForLoadState('networkidle');
        
        // 检查是否有"控制面板"链接（表示已登录）
        const isLoggedIn = await page.locator('a:has-text("控制面板")').count() > 0;
        
        if (isLoggedIn) {
          success('Cookie有效，已登录');
          needLogin = false;
        } else {
          warning('Cookie已失效，需要重新登录');
          await context.close();
        }
      } catch (err) {
        warning('使用Cookie登录失败，将执行正常登录流程');
        if (context) await context.close();
      }
    } else {
      info('未找到已保存的Cookie，将执行登录流程');
    }
    
    // 步骤2: 如果需要登录，执行登录流程
    if (needLogin) {
      info('开始登录流程');
      context = await browser.newContext();
      const page = await context.newPage();
      
      // 访问登录页面
      await page.goto(getLoginUrl());
      await page.waitForLoadState('networkidle');

      // 执行登录（选择器与验证码处理见 utils/auth.js，来自 codegen 录制）
      await performLogin(page);
      
      // 验证登录成功（等待"控制面板"链接出现）
      await page.waitForSelector('a:has-text("控制面板")', { timeout: 10000 });
      
      success('登录成功');
      
      // 保存Cookie供下次使用
      await saveCookies(context);
      
      // 截图
      await page.screenshot({ 
        path: `storage/screenshots/auto-login-${Date.now()}.png`,
        fullPage: true 
      });
    }
    
    // 步骤3: 执行签到
    info('开始签到流程');
    const page = context.pages()[0] || await context.newPage();
    
    // 访问首页
    await page.goto(getSigninUrl());
    await page.waitForLoadState('networkidle');
    
    // 进入控制面板
    info('进入控制面板');
    await page.getByRole('link', { name: '控制面板' }).click();
    await page.waitForLoadState('networkidle');

    // 关闭进入控制面板后可能出现的公告弹窗
    await dismissNoticeDialogIfPresent(page);
    
    // 检查是否已签到（签到按钮是否存在）
    // codegen: name 可能为 "fingerprint 立即续命"
    const signinButton = page.getByRole('button', { name: /立即续命/ });
    const alreadySigned = await signinButton.count() === 0;
    
    if (alreadySigned) {
      warning('今日已经签到过了');
      await page.screenshot({ 
        path: `storage/screenshots/auto-already-signed-${Date.now()}.png`,
        fullPage: true 
      });
      
      // 发送微信通知
      await notifyAlreadySigned();
      
      info('========================================');
      info('任务完成：今日已签到');
      info('========================================');
      return;
    }
    
    // 执行签到（站点可能在点击后弹出签到验证码）
    info('点击签到按钮');
    const responsePromise = page
      .waitForResponse(isLikelyCheckinResponse, { timeout: 20000 })
      .catch(() => null);

    const signinBtn = page.getByRole('button', { name: /立即续命/ });
    await signinBtn.click();

    const checkinCaptchaVisible = await page
      .getByText('签到验证')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    /** @type {object|string|null} */
    let signinData = null;
    if (checkinCaptchaVisible) {
      info('检测到签到验证码弹窗，开始 OCR 识别');
      const ocr = await createOcrEngine({ charset: 'math' });
      // 验证码流程里，真正的签到接口在「确认」时返回；在成功提交时单独捕获
      signinData = await completeCheckinCaptcha(page, ocr);
    } else {
      signinData = await readSigninResponse(await responsePromise);
    }

    if (signinData != null) {
      info('签到接口返回: ' + JSON.stringify(signinData, null, 2));
    } else {
      info('未捕获到签到接口响应，将尝试从成功弹窗提取奖励信息');
    }

    await page.waitForTimeout(1000);

    // 验证签到成功（等待确认按钮出现，兼容「知道了」和「好的，我知道了」）
    const confirmButton = page.getByRole('button', { name: /好的，我知道了|知道了/ });
    await confirmButton.waitFor({ timeout: 15000 });

    const dialogMessage = await extractSuccessDialogMessage(page);

    // 点击确认按钮关闭提示
    await confirmButton.click();

    const formattedMessage = formatSigninMessage(signinData, dialogMessage);
    success('签到成功！');
    info('签到结果: ' + formattedMessage);

    // 截图保存结果
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    await page.screenshot({
      path: `storage/screenshots/auto-signin-success-${timestamp}.png`,
      fullPage: true
    });

    // 发送微信通知（使用与日志相同的格式化内容）
    await notifySigninSuccess(formattedMessage);
    
    info('========================================');
    info('任务完成：签到成功');
    info('========================================');
    
  } catch (err) {
    error('自动签到失败: ' + err.message);
    error(err.stack);
    
    // 失败时也截图，便于排查问题
    try {
      const page = context?.pages()[0];
      if (page) {
        await page.screenshot({ 
          path: `storage/screenshots/auto-signin-error-${Date.now()}.png`,
          fullPage: true 
        });
      }
    } catch (screenshotErr) {
      error('截图失败: ' + screenshotErr.message);
    }
    
    // 发送失败通知到微信
    await notifySigninFailure(err.message);
    
    throw err;
  } finally {
    if (context) {
      await context.close();
    }
  }
});

/**
 * 使用提示：
 * 
 * 调试模式（显示浏览器）：
 *   npm run signin:debug
 * 
 * 正常运行（无头模式）：
 *   npm run signin
 * 
 * 配置定时任务后，可以每天自动运行这个脚本
 */
