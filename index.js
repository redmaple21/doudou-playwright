// @ts-check
import { execSync } from 'child_process';
import { info, error } from './utils/logger.js';

/**
 * 自动签到脚本主入口
 */

function main() {
  try {
    info('========================================');
    info('开始执行自动签到任务');
    info('========================================');
    
    // 检查是否使用调试模式（显示浏览器）
    const isDebug = process.argv.includes('--headed');
    
    if (isDebug) {
      info('调试模式：将显示浏览器窗口');
    } else {
      info('无头模式：后台运行');
    }
    
    // 执行自动签到测试
    execSync('npx playwright test tests/auto-signin.spec.js', {
      stdio: 'inherit',
      env: { ...process.env, HEADLESS: isDebug ? 'false' : 'true' }
    });
    
    info('========================================');
    info('自动签到任务完成');
    info('========================================');
  } catch (err) {
    error('自动签到任务执行失败');
    error(err.message);
    process.exit(1);
  }
}

main();
