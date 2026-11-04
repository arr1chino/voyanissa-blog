/* 首页公开日程小日历，与日历页共用后台发布的数据。 */
(function () {
  'use strict';

  var WEEK = ['一', '二', '三', '四', '五', '六', '日'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

  /* 这一天是什么日子（可能同时是好几个，所以是数组） */
  function festivalsOf(y, m, d) {
    var api = window.HB_HOLIDAYS;
    if (!api || typeof api.ymd !== 'function') return [];
    try { return api.ymd(y, m, d) || []; } catch (e) { return []; }
  }

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var grid = document.getElementById('hb-mini-cal-grid');
    if (!grid) return;

    var monthEl = document.getElementById('hb-mini-cal-month');
    var festWrap = document.getElementById('hb-mini-cal-fests');
    var footEl = document.getElementById('hb-mini-cal-foot');

    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var todayKey = keyOf(year, month, now.getDate());
    /* 表头从周一开始，getDay() 里周日是 0，所以 (day + 6) % 7 */
    var lead = (new Date(year, month, 1).getDay() + 6) % 7;
    var dayCount = new Date(year, month + 1, 0).getDate();
    var notes = window.HB_PUBLIC_SCHEDULE || {};
    var fests = [];

    if (monthEl) monthEl.textContent = year + ' 年 ' + (month + 1) + ' 月';

    grid.innerHTML = '';
    WEEK.forEach(function (w) {
      grid.appendChild(make('span', 'hb-mc-week', w));
    });

    var i;
    for (i = 0; i < lead; i++) grid.appendChild(make('span', 'hb-mc-day is-blank'));

    for (var d = 1; d <= dayCount; d++) {
      var key = keyOf(year, month, d);
      /* 注意：month 是 0 起的（0 = 一月），节日表要的是 1 起的 */
      var names = festivalsOf(year, month + 1, d);
      var note = notes[key];
      var cell = make('span', 'hb-mc-day');
      var tips = [d + ' 日'];

      if (names.length) {
        cell.classList.add('is-fest');
        tips.push(names.join('、'));
        fests.push({ day: d, names: names });
      }
      if (note && note.length) {
        cell.classList.add('has-note');
        tips.push(note.length + ' 条日程');
      }
      if (key === todayKey) {
        cell.classList.add('is-today');
        tips.push('今天');
      }
      cell.title = tips.join(' · ');

      cell.appendChild(make('b', 'hb-mc-num', String(d)));
      if (note && note.length) cell.appendChild(make('i', 'hb-mc-dot'));
      grid.appendChild(cell);
    }

    /* 尾巴补齐空格子，让最后一行也是整整齐齐七格 */
    var tail = (7 - ((lead + dayCount) % 7)) % 7;
    for (i = 0; i < tail; i++) grid.appendChild(make('span', 'hb-mc-day is-blank'));

    /* 本月有哪些特别的日子，横着列成小药丸 */
    if (festWrap) {
      festWrap.innerHTML = '';
      if (fests.length) {
        fests.slice(0, 4).forEach(function (f) {
          festWrap.appendChild(make('span', 'hb-mc-fest', f.day + ' 日 ' + f.names.join('/')));
        });
        if (fests.length > 4) {
          festWrap.appendChild(make('span', 'hb-mc-fest hb-mc-fest--none', '还有 ' + (fests.length - 4) + ' 个'));
        }
      } else {
        festWrap.appendChild(make('span', 'hb-mc-fest hb-mc-fest--none', '这个月没有特别的日子'));
      }
    }

    /* 统计本月公开条目，同一天的多条安排分别计数。 */
    if (footEl) {
      var mine = 0;
      for (var k in notes) {
        if (!Object.prototype.hasOwnProperty.call(notes, k)) continue;
        if (k.indexOf(year + '-' + pad(month + 1) + '-') === 0 && notes[k] && notes[k].length) mine += notes[k].length;
      }
      footEl.textContent = mine
        ? '本月公开 ' + mine + ' 条日程 · 点开看全部'
        : (window.HB_PUBLIC_SCHEDULE ? '本月暂无公开日程 · 查看日历' : '日程暂时未能加载 · 点开重试');
    }
  });
})();
