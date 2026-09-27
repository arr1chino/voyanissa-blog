/* ===== 侧栏「本月日程」小日历 =====
   首页左右两栏里那张小卡片：把本月的日期铺成一个小格子。
   有节日的那天会标红并带名字（鼠标停上去能看见），今天是实心圆点，
   自己批注过日程的日子会多一个小蓝点。
   整张卡点一下 → 去 /calendar/ 那一页写日程（那边才能批注、导入导出）。

   节日从 /js/hb-holidays.js 取，所以那个文件必须排在它前面；
   自己写的批注存在浏览器里，和日历页共用同一份存储（hb-calendar-v1）。 */
(function () {
  'use strict';

  var STORE_KEY = 'hb-calendar-v1';
  var WEEK = ['一', '二', '三', '四', '五', '六', '日'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

  /* 这一天是什么日子（可能同时是好几个，所以是数组） */
  function festivalsOf(y, m, d) {
    var api = window.HB_HOLIDAYS;
    if (!api || typeof api.ymd !== 'function') return [];
    try { return api.ymd(y, m, d) || []; } catch (e) { return []; }
  }

  /* 自己批注过的日程（和日历页同一个存档） */
  function notesOf() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') return data;
    } catch (e) { /* 读不到就当没有 */ }
    return {};
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
    var notes = notesOf();
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

    /* 底下那行小字：这个月自己写了几条 */
    if (footEl) {
      var mine = 0;
      for (var k in notes) {
        if (!Object.prototype.hasOwnProperty.call(notes, k)) continue;
        if (k.indexOf(year + '-' + pad(month + 1) + '-') === 0 && notes[k] && notes[k].length) mine++;
      }
      footEl.textContent = mine
        ? '本月你写了 ' + mine + ' 条日程 · 点开看全部'
        : '点开可以给自己批注日程';
    }
  });
})();
