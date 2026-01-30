// @ts-check
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * 日志记录工具
 */

const LOG_DIR = join(process.cwd(), 'storage', 'logs');

/**
 * 格式化当前时间
 * @returns {string}
 */
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
}

/**
 * 获取今天的日志文件路径
 * @returns {string}
 */
function getLogFilePath() {
  const today = new Date().toISOString().split('T')[0];
  return join(LOG_DIR, `${today}.log`);
}

/**
 * 写入日志
 * @param {string} message
 * @param {'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING'} level
 */
export function log(message, level = 'INFO') {
  const timestamp = formatTimestamp();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  // 输出到控制台
  console.log(logMessage.trim());
  
  // 写入文件
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    appendFileSync(getLogFilePath(), logMessage, 'utf-8');
  } catch (error) {
    console.error('日志写入失败:', error.message);
  }
}

/**
 * 记录信息日志
 * @param {string} message
 */
export function info(message) {
  log(message, 'INFO');
}

/**
 * 记录成功日志
 * @param {string} message
 */
export function success(message) {
  log(message, 'SUCCESS');
}

/**
 * 记录错误日志
 * @param {string} message
 */
export function error(message) {
  log(message, 'ERROR');
}

/**
 * 记录警告日志
 * @param {string} message
 */
export function warning(message) {
  log(message, 'WARNING');
}
