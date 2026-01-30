// @ts-check
import dotenv from 'dotenv';
import { join } from 'path';

// 加载环境变量
dotenv.config({ path: join(process.cwd(), 'config', '.env') });

/**
 * 消息推送工具（支持爱语飞飞推送到微信）
 */

/**
 * 获取北京时间字符串
 * @returns {string} 格式：YYYY-MM-DD HH:mm:ss
 */
function getBeijingTime() {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingTime = new Date(utcTime + 8 * 3600000);
  
  const year = beijingTime.getFullYear();
  const month = (beijingTime.getMonth() + 1).toString().padStart(2, '0');
  const day = beijingTime.getDate().toString().padStart(2, '0');
  const hours = beijingTime.getHours().toString().padStart(2, '0');
  const minutes = beijingTime.getMinutes().toString().padStart(2, '0');
  const seconds = beijingTime.getSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 通过爱语飞飞推送消息到微信
 * @param {string} title - 消息标题
 * @param {string} message - 消息内容
 * @returns {Promise<boolean>} 是否发送成功
 */
export async function sendWechatNotification(title, message) {
  const iyuuToken = process.env.IYUU_TOKEN;
  
  // 如果未配置 IYUU Token，跳过推送
  if (!iyuuToken) {
    console.log('[通知] 未配置 IYUU_TOKEN，跳过微信推送');
    return false;
  }
  
  try {
    const iyuuUrl = `https://iyuu.cn/${iyuuToken}.send`;
    
    console.log('[通知] 正在发送消息到微信...');
    
    const response = await fetch(iyuuUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: title,
        desp: message
      })
    });
    
    const result = await response.json();
    
    if (result.errcode === 0) {
      console.log(`[通知] ✅ 消息已发送到微信：${result.errmsg}`);
      return true;
    } else {
      console.error(`[通知] ❌ 发送失败：${result.errmsg}`);
      return false;
    }
  } catch (error) {
    console.error('[通知] ❌ 发送消息到微信时出错:', error.message);
    return false;
  }
}

/**
 * 发送签到成功通知
 * @param {string} resultMessage - 签到结果消息
 */
export async function notifySigninSuccess(resultMessage) {
  const time = getBeijingTime();
  const message = `【豆豆签到通知】\n时间：${time}\n结果：${resultMessage}`;
  
  await sendWechatNotification('豆豆签到通知', message);
}

/**
 * 发送签到失败通知
 * @param {string} errorMessage - 错误消息
 */
export async function notifySigninFailure(errorMessage) {
  const time = getBeijingTime();
  const message = `【豆豆签到通知】\n时间：${time}\n状态：❌ 签到失败\n原因：${errorMessage}`;
  
  await sendWechatNotification('豆豆签到通知', message);
}

/**
 * 发送今日已签到通知
 */
export async function notifyAlreadySigned() {
  const time = getBeijingTime();
  const message = `【豆豆签到通知】\n时间：${time}\n状态：✅ 今日已签到`;
  
  await sendWechatNotification('豆豆签到通知', message);
}
