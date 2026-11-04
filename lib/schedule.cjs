'use strict';

function buildSchedule(data = {}) {
  const events = data.events || [];
  if (!Array.isArray(events)) throw new Error('公开日程需要是列表');
  const schedule = {};

  for (const event of events) {
    const date = event.date instanceof Date ? event.date.toISOString().slice(0, 10) : event.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('日程日期请使用 YYYY-MM-DD 格式');
    }
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('日程日期不存在：' + date);
    }
    if (typeof event.title !== 'string' || !event.title.trim()) throw new Error('请填写日程标题');
    const time = event.time || '';
    if (typeof time !== 'string' || (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new Error('日程时间请使用 HH:mm 格式，全天日程可留空');
    }
    if (event.note != null && typeof event.note !== 'string') throw new Error('日程备注需要是文字');
    if (!schedule[date]) schedule[date] = [];
    schedule[date].push({title: event.title.trim(), time, note: event.note || ''});
  }
  for (const entries of Object.values(schedule)) entries.sort((left, right) => left.time.localeCompare(right.time));
  return schedule;
}

module.exports = {buildSchedule};
