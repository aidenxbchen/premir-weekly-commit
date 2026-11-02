// "W30" -> 30；解析不出数字时返回 NaN，调用方按需处理。
export function parseWeekNumber(week: string): number {
  const match = /^W([0-9]+)$/.exec(week);
  return match ? Number(match[1]) : NaN;
}

// 每周一全天放开交付物修改：不需要管理员逐条解锁，本人可以自行编辑；周二 0 点
// （北京时间）起恢复锁定，回到"管理员一次性解锁一条"的既有方案。服务器很可能
// 不跑在北京时区，这里必须显式按 Asia/Shanghai 判断星期几，不能直接用
// now.getDay()（那是服务器本地时区）。
export function isMondayInShanghai(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(now);
  return weekday === 'Mon';
}
