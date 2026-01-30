// 测试微信推送功能
import { notifySigninSuccess, notifySigninFailure, notifyAlreadySigned } from './utils/notifier.js';

console.log('开始测试微信推送功能...\n');

// 测试签到成功通知
console.log('1. 测试签到成功通知');
await notifySigninSuccess('✅ 测试签到成功');

console.log('\n等待 2 秒...\n');
await new Promise(resolve => setTimeout(resolve, 2000));

// 测试已签到通知
console.log('2. 测试今日已签到通知');
await notifyAlreadySigned();

console.log('\n等待 2 秒...\n');
await new Promise(resolve => setTimeout(resolve, 2000));

// 测试签到失败通知
console.log('3. 测试签到失败通知');
await notifySigninFailure('这是一个测试错误消息');

console.log('\n测试完成！请检查微信是否收到 3 条消息。');
console.log('如果没有收到，请检查：');
console.log('1. config/.env 中的 IYUU_TOKEN 是否正确');
console.log('2. 是否已关注"爱语飞飞"微信公众号');
console.log('3. 网络连接是否正常');
