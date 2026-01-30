// @ts-check
import cron from 'node-cron';
import { execSync } from 'child_process';
import { info, error, success } from './utils/logger.js';

/**
 * 定时任务调度器
 * 
 * 使用 node-cron 实现定时自动签到
 * 
 * Cron 表达式格式：
 * ┌────────────── 秒 (可选, 0-59)
 * │ ┌──────────── 分钟 (0-59)
 * │ │ ┌────────── 小时 (0-23)
 * │ │ │ ┌──────── 日期 (1-31)
 * │ │ │ │ ┌────── 月份 (1-12)
 * │ │ │ │ │ ┌──── 星期 (0-7, 0和7都表示周日)
 * │ │ │ │ │ │
 * * * * * * *
 */

// 配置定时任务
const SCHEDULE_CONFIG = {
  // 默认每天早上 9:00 执行
  time: '0 9 * * *',
  
  // 是否立即执行一次（用于测试）
  runOnStart: false,
  
  // 时区
  timezone: 'Asia/Shanghai'
};

/**
 * 执行签到任务
 */
function runSigninTask() {
  info('========================================');
  info('定时任务触发，开始执行自动签到');
  info('========================================');
  
  try {
    // 执行签到脚本（使用无头模式）
    execSync('node index.js', {
      stdio: 'inherit',
      env: { ...process.env, HEADLESS: 'true' }
    });
    
    success('定时任务执行成功');
  } catch (err) {
    error('定时任务执行失败: ' + err.message);
  }
  
  info('========================================');
  info('等待下次执行时间...');
  info('========================================');
}

/**
 * 启动定时任务
 */
function startScheduler() {
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│     自动签到定时任务调度器已启动            │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
  console.log(`⏰ 执行时间: ${SCHEDULE_CONFIG.time}`);
  console.log(`🌏 时区: ${SCHEDULE_CONFIG.timezone}`);
  console.log(`🔄 立即执行: ${SCHEDULE_CONFIG.runOnStart ? '是' : '否'}`);
  console.log('');
  console.log('按 Ctrl+C 停止调度器');
  console.log('─────────────────────────────────────────────');
  console.log('');
  
  // 如果配置了立即执行，先执行一次
  if (SCHEDULE_CONFIG.runOnStart) {
    info('配置了立即执行，现在开始执行...');
    runSigninTask();
  }
  
  // 创建定时任务
  const task = cron.schedule(
    SCHEDULE_CONFIG.time,
    runSigninTask,
    {
      timezone: SCHEDULE_CONFIG.timezone,
      scheduled: true
    }
  );
  
  // 计算下次执行时间
  const nextRun = getNextRunTime(SCHEDULE_CONFIG.time);
  info(`下次执行时间: ${nextRun}`);
  
  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('');
    info('收到停止信号，正在关闭调度器...');
    task.stop();
    success('调度器已停止');
    process.exit(0);
  });
}

/**
 * 获取下次执行时间（简化版）
 * @param {string} cronExpression
 * @returns {string}
 */
function getNextRunTime(cronExpression) {
  // 这里只是一个简单的显示，实际的计算由 node-cron 完成
  const parts = cronExpression.split(' ');
  if (parts.length >= 5) {
    const [minute, hour] = parts;
    return `每天 ${hour}:${minute.padStart(2, '0')}`;
  }
  return '根据 cron 表达式计算';
}

// ============================================
// 常用的 Cron 表达式示例
// ============================================
/*

每天早上 9:00 执行：
'0 9 * * *'

每天早上 6:00 和晚上 18:00 执行：
'0 6,18 * * *'

每隔 2 小时执行一次：
'0 *\/2 * * *'

每周一早上 9:00 执行：
'0 9 * * 1'

每月1号早上 9:00 执行：
'0 9 1 * *'

每天早上 9:00 到 18:00 之间每小时执行：
'0 9-18 * * *'

工作日（周一到周五）早上 9:00 执行：
'0 9 * * 1-5'

每5分钟执行一次（用于测试）：
'*\/5 * * * *'

每分钟执行一次（用于调试）：
'* * * * *'

*/

// ============================================
// 启动调度器
// ============================================

// 如果你想修改执行时间，修改这里：
// SCHEDULE_CONFIG.time = '0 8 * * *';  // 改为早上8点

// 如果你想测试，可以设置为每分钟执行：
// SCHEDULE_CONFIG.time = '* * * * *';
// SCHEDULE_CONFIG.runOnStart = true;

startScheduler();

/**
 * 使用说明：
 * 
 * 1. 确保已经配置好 .env 文件和选择器
 * 2. 测试手动执行是否正常: npm run signin:debug
 * 3. 修改上面的 SCHEDULE_CONFIG.time 设置执行时间
 * 4. 运行定时任务: node scheduler.js
 * 5. 保持终端/命令行窗口运行
 * 
 * 提示：
 * - 在 Windows 上，可以使用任务计划程序开机自启动此脚本
 * - 在 Linux/Mac 上，可以使用 systemd 或 pm2 管理此进程
 * - 使用 pm2: pm2 start scheduler.js --name "auto-signin"
 */
