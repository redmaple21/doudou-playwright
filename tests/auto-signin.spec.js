// @ts-check
import { test } from '@playwright/test';
import { getLoginUrl, getSigninUrl, performLogin } from '../utils/auth.js';
import { hasSavedCookies, getCookiePath, saveCookies } from '../utils/cookie.js';
import { info, success, error, warning } from '../utils/logger.js';
import { notifySigninSuccess, notifySigninFailure, notifyAlreadySigned } from '../utils/notifier.js';

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
      
      // 使用从 Codegen 获取的选择器
      const USERNAME_SELECTOR = '#email2';
      const PASSWORD_SELECTOR = 'input[type="password"]';
      const SUBMIT_SELECTOR = 'button:has-text("登錄")';
      
      // 执行登录
      await performLogin(page, USERNAME_SELECTOR, PASSWORD_SELECTOR, SUBMIT_SELECTOR);
      
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
    
    // 检查是否已签到（签到按钮是否存在）
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
    
    // 执行签到
    info('点击签到按钮');
    await page.getByRole('button', { name: /立即续命/ }).click();
    await page.waitForTimeout(2000);
    
    // 验证签到成功（等待"知道了"按钮出现）
    await page.waitForSelector('text=知道了', { timeout: 5000 });
    
    // 点击"知道了"关闭提示
    await page.getByText('知道了').click();
    
    success('签到成功！');
    
    // 截图保存结果
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    await page.screenshot({ 
      path: `storage/screenshots/auto-signin-success-${timestamp}.png`,
      fullPage: true 
    });
    
    // 发送微信通知
    await notifySigninSuccess('✅ 签到成功');
    
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
