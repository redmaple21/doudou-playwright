// @ts-check
import { test, expect } from '@playwright/test';
import { getSigninUrl } from '../utils/auth.js';
import { hasSavedCookies, getCookiePath } from '../utils/cookie.js';
import { info, success, error, warning } from '../utils/logger.js';
import { notifySigninSuccess, notifyAlreadySigned } from '../utils/notifier.js';

/**
 * 签到功能测试
 * 
 * 使用说明：
 * 1. 确保已经运行过登录测试并保存了Cookie
 * 2. 使用 Codegen 工具获取签到相关的选择器
 * 3. 将下面的占位符替换为实际的选择器
 * 4. 运行 `npm run test:signin` 测试签到功能
 */

test.describe('签到功能', () => {
  test.beforeEach(async () => {
    // 检查是否有保存的Cookie
    if (!hasSavedCookies()) {
      warning('未找到已保存的Cookie，请先运行登录测试: npm run test:login');
      test.skip();
    }
  });
  
  test('执行签到', async ({ browser }) => {
    info('开始签到测试');
    
    // 使用已保存的Cookie创建上下文
    const context = await browser.newContext({
      storageState: getCookiePath()
    });
    const page = await context.newPage();
    
    try {
      // 1. 访问签到页面
      const signinUrl = getSigninUrl();
      info(`正在访问签到页面: ${signinUrl}`);
      await page.goto(signinUrl);
      await page.waitForLoadState('networkidle');
      
      // 2. 先导航到控制面板
      await page.getByRole('link', { name: '控制面板' }).click();
      await page.waitForLoadState('networkidle');
      
      // 检查签到按钮是否存在（如果不存在可能已经签到）
      const SIGNIN_BUTTON = page.getByRole('button', { name: /立即续命/ });
      const alreadySigned = await SIGNIN_BUTTON.count() === 0;
      
      if (alreadySigned) {
        warning('今日已经签到过了');
        await page.screenshot({ 
          path: `storage/screenshots/already-signed-${Date.now()}.png`,
          fullPage: true 
        });
        await notifyAlreadySigned();
        return;
      }
      
      // 3. 执行签到操作
      info('开始点击签到按钮');
      
      // 点击"立即续命"按钮进行签到
      await page.getByRole('button', { name: /立即续命/ }).click();
      info('已点击签到按钮');
      
      // 等待签到完成（根据实际情况调整等待时间）
      await page.waitForTimeout(2000);
      
      // 4. 验证签到成功
      info('验证签到结果');
      
      // 检查"知道了"按钮是否出现（签到成功的提示）
      const successButton = page.getByText('知道了');
      await expect(successButton).toBeVisible({ timeout: 5000 });
      
      // 点击"知道了"关闭提示
      await successButton.click();
      
      success('签到成功！');
      
      // 5. 截图保存
      await page.screenshot({ 
        path: `storage/screenshots/signin-success-${Date.now()}.png`,
        fullPage: true 
      });
      info('已保存签到成功截图');
      
      // 6. 发送微信通知
      await notifySigninSuccess('✅ 签到成功');
      
    } catch (err) {
      error('签到失败: ' + err.message);
      
      // 失败时截图，便于分析问题
      await page.screenshot({ 
        path: `storage/screenshots/signin-failed-${Date.now()}.png`,
        fullPage: true 
      });
      
      throw err;
    } finally {
      await context.close();
    }
  });
  
  test('检查签到状态', async ({ browser }) => {
    info('检查当前签到状态');
    
    const context = await browser.newContext({
      storageState: getCookiePath()
    });
    const page = await context.newPage();
    
    try {
      await page.goto(getSigninUrl());
      await page.waitForLoadState('networkidle');
      
      // 先进入控制面板
      await page.getByRole('link', { name: '控制面板' }).click();
      await page.waitForLoadState('networkidle');
      
      // 检查签到按钮状态
      const signinButton = page.getByRole('button', { name: /立即续命/ });
      const canSignin = await signinButton.count() > 0;
      const alreadySigned = !canSignin;
      
      if (alreadySigned) {
        info('✅ 今日已签到');
      } else if (canSignin) {
        info('❌ 今日未签到，可以签到');
      } else {
        warning('⚠️  无法确定签到状态');
      }
      
      await page.screenshot({ 
        path: `storage/screenshots/signin-status-${Date.now()}.png`,
        fullPage: true 
      });
      
    } catch (err) {
      error('检查签到状态失败: ' + err.message);
      throw err;
    } finally {
      await context.close();
    }
  });
});

/**
 * 常见问题解决：
 * 
 * 1. 如果签到按钮需要滚动才能看到：
 *    await page.locator(SIGNIN_BUTTON_SELECTOR).scrollIntoViewIfNeeded();
 *    await page.click(SIGNIN_BUTTON_SELECTOR);
 * 
 * 2. 如果有弹窗需要处理：
 *    page.on('dialog', dialog => dialog.accept());
 * 
 * 3. 如果签到需要多步操作（如点击多个按钮）：
 *    await page.click('button1');
 *    await page.waitForTimeout(1000);
 *    await page.click('button2');
 * 
 * 4. 如果签到有动画或加载过程：
 *    await page.waitForLoadState('networkidle');
 *    await page.waitForTimeout(2000);
 */
