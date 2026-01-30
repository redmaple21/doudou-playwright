// @ts-check
import dotenv from 'dotenv';
import { join } from 'path';

// 加载环境变量
dotenv.config({ path: join(process.cwd(), 'config', '.env') });

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
 * 执行登录操作
 * @param {import('@playwright/test').Page} page
 * @param {string} usernameSelector - 用户名输入框选择器
 * @param {string} passwordSelector - 密码输入框选择器
 * @param {string} submitSelector - 登录按钮选择器
 */
export async function performLogin(page, usernameSelector, passwordSelector, submitSelector) {
  const username = getUsername();
  const password = getPassword();
  
  if (!username || !password) {
    throw new Error('未配置用户名或密码，请检查 .env 文件');
  }
  
  console.log('[Auth] 开始填写登录表单...');
  
  // 填写用户名
  await page.fill(usernameSelector, username);
  console.log('[Auth] 已填写用户名');
  
  // 填写密码
  await page.fill(passwordSelector, password);
  console.log('[Auth] 已填写密码');
  
  // 点击登录按钮
  await page.click(submitSelector);
  console.log('[Auth] 已点击登录按钮');
  
  // 等待导航完成
  await page.waitForLoadState('networkidle');
  console.log('[Auth] 页面加载完成');
}
