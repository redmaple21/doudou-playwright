// @ts-check
import { test, expect } from '@playwright/test';
import { getLoginUrl, performLogin } from '../utils/auth.js';
import { saveCookies } from '../utils/cookie.js';
import { info, success, error } from '../utils/logger.js';

/**
 * 登录功能测试
 * 
 * 使用说明：
 * 1. 运行 `npx playwright codegen [目标网站URL]` 来获取选择器
 * 2. 将下面的占位符替换为实际的选择器
 * 3. 运行 `npm run test:login` 测试登录功能
 */

test.describe('登录功能', () => {
  test('成功登录并保存Cookie', async ({ browser }) => {
    info('开始登录测试');
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      // 1. 打开登录页面
      const loginUrl = getLoginUrl();
      info(`正在访问登录页面: ${loginUrl}`);
      await page.goto(loginUrl);
      
      // 等待页面加载完成
      await page.waitForLoadState('networkidle');
      
      // 2. 填写登录表单
      info('开始填写登录表单');
      
      // 从 Codegen 自动生成的选择器
      const USERNAME_SELECTOR = '#email2';  // 邮箱输入框
      const PASSWORD_SELECTOR = 'input[type="password"]';  // 密码输入框
      const SUBMIT_SELECTOR = 'button:has-text("登錄")';  // 登录按钮
      
      await performLogin(page, USERNAME_SELECTOR, PASSWORD_SELECTOR, SUBMIT_SELECTOR);
      
      // 3. 验证登录成功
      info('验证登录状态');
      
      // 登录成功后会出现"控制面板"链接
      await page.waitForSelector('a:has-text("控制面板")', { timeout: 10000 });
      await expect(page.locator('a:has-text("控制面板")')).toBeVisible();
      
      success('登录成功！');
      
      // 4. 保存Cookie
      const saved = await saveCookies(context);
      if (saved) {
        success('Cookie已保存，下次可以跳过登录');
      }
      
      // 5. 可选：截图保存
      await page.screenshot({ 
        path: `storage/screenshots/login-success-${Date.now()}.png`,
        fullPage: true 
      });
      info('已保存登录成功截图');
      
    } catch (err) {
      error('登录失败: ' + err.message);
      
      // 失败时截图
      await page.screenshot({ 
        path: `storage/screenshots/login-failed-${Date.now()}.png`,
        fullPage: true 
      });
      
      throw err;
    } finally {
      await context.close();
    }
  });
  
  test('验证Cookie登录', async ({ browser }) => {
    info('测试使用Cookie登录');
    
    // 这个测试需要先运行上面的登录测试，保存Cookie后才能通过
    const { hasSavedCookies, getCookiePath } = await import('../utils/cookie.js');
    
    if (!hasSavedCookies()) {
      console.log('⚠️  未找到已保存的Cookie，请先运行登录测试');
      test.skip();
      return;
    }
    
    const context = await browser.newContext({
      storageState: getCookiePath()
    });
    const page = await context.newPage();
    
    try {
      // 访问需要登录才能访问的页面
      await page.goto(getLoginUrl());
      await page.waitForLoadState('networkidle');
      
      // 检查是否已登录（控制面板链接是否可见）
      await page.waitForSelector('a:has-text("控制面板")', { timeout: 5000 });
      
      success('Cookie登录成功！');
      
    } catch (err) {
      error('Cookie登录失败，Cookie可能已过期');
      throw err;
    } finally {
      await context.close();
    }
  });
});

/**
 * 调试技巧：
 * 
 * 1. 查看页面内容：
 *    await page.pause();  // 暂停，打开Playwright Inspector
 * 
 * 2. 打印页面HTML：
 *    console.log(await page.content());
 * 
 * 3. 等待特定时间：
 *    await page.waitForTimeout(2000);  // 等待2秒
 * 
 * 4. 查看元素是否存在：
 *    const exists = await page.locator('selector').count() > 0;
 */
