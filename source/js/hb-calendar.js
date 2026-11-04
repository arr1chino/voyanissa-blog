/* 公开日程。由登录后的写作后台发布，所有访客读取同一份数据。 */
(function () {
  'use strict';

  var WEEK = ['一', '二', '三', '四', '五', '六', '日'];
  var MONTH_CN = ['一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

  function todayKey() {
    var t = new Date();
    return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* 这一天是什么日子（元旦、中秋节…），数据在 /js/hb-holidays.js。
     万一那个文件没加载上，就当没有节日，日历本身照样能用。 */
  function festivalsOf(y, m, d) {
    var api = window.HB_HOLIDAYS;
    if (!api || typeof api.ymd !== 'function') return [];
    try { return api.ymd(y, m, d) || []; } catch (e) { return []; }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var mount = document.getElementById('hb-calendar');
    if (!mount) return;

    var loaded = !!window.HB_PUBLIC_SCHEDULE;
    var store = window.HB_PUBLIC_SCHEDULE || {};
    var view = new Date();
    view.setDate(1);
    var selected = todayKey();

    /* ---------- 骨架 ---------- */
    var head = el('div', 'hb-cal-head');
    var nav = el('div', 'hb-cal-nav');
    var prev = el('button', 'hb-cal-arrow');
    prev.type = 'button';
    prev.setAttribute('aria-label', '上一个月');
    prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    var title = el('div', 'hb-cal-title');
    var next = el('button', 'hb-cal-arrow');
    next.type = 'button';
    next.setAttribute('aria-label', '下一个月');
    next.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nav.appendChild(prev);
    nav.appendChild(title);
    nav.appendChild(next);

    var tools = el('div', 'hb-cal-tools');
    var todayBtn = el('button', 'hb-cal-mini', '回到今天');
    todayBtn.type = 'button';
    var manageLink = el('a', 'hb-cal-mini', '管理日程');
    manageLink.href = '/admin/#/collections/settings/entries/schedule';
    tools.appendChild(todayBtn);
    tools.appendChild(manageLink);

    head.appendChild(nav);
    head.appendChild(tools);

    var grid = el('div', 'hb-cal-grid');
    var listWrap = el('div', 'hb-cal-side');
    var editor = el('div', 'hb-cal-editor');

    var body = el('div', 'hb-cal-body');
    body.appendChild(grid);
    body.appendChild(listWrap);

    mount.appendChild(head);
    mount.appendChild(body);
    mount.appendChild(editor);

    var hint = el('p', 'hb-cal-hint',
      '这里展示博主发布的公开安排，时间均为北京时间。');
    mount.appendChild(hint);

    /* ---------- 月历 ---------- */
    function renderGrid() {
      title.textContent = view.getFullYear() + ' 年 ' + MONTH_CN[view.getMonth()];
      grid.innerHTML = '';

      WEEK.forEach(function (w) {
        grid.appendChild(el('div', 'hb-cal-week', w));
      });

      var year = view.getFullYear();
      var month = view.getMonth();
      var first = new Date(year, month, 1);
      /* 表头从周一开始，getDay() 里周日是 0，所以 (day+6)%7 */
      var lead = (first.getDay() + 6) % 7;
      var days = new Date(year, month + 1, 0).getDate();
      var prevDays = new Date(year, month, 0).getDate();
      var today = todayKey();

      var cells = Math.ceil((lead + days) / 7) * 7;

      for (var i = 0; i < cells; i++) {
        var offset = i - lead;
        var cellYear = year, cellMonth = month, cellDay = offset + 1, outside = false;

        if (offset < 0) {
          cellDay = prevDays + offset + 1;
          cellMonth = month - 1;
          outside = true;
        } else if (offset >= days) {
          cellDay = offset - days + 1;
          cellMonth = month + 1;
          outside = true;
        }
        if (cellMonth < 0) { cellMonth = 11; cellYear--; }
        if (cellMonth > 11) { cellMonth = 0; cellYear++; }

        var k = keyOf(cellYear, cellMonth, cellDay);
        var cell = el('button', 'hb-cal-day');
        cell.type = 'button';
        cell.dataset.date = k;
        if (outside) cell.classList.add('is-outside');
        if (k === today) cell.classList.add('is-today');
        if (k === selected) cell.classList.add('is-picked');

        cell.appendChild(el('span', 'hb-cal-num', String(cellDay)));

        /* 节日：淡红底 + 小红字（和首页侧栏那张小日历一个样子） */
        if (!outside) {
          var fests = festivalsOf(cellYear, cellMonth + 1, cellDay);
          if (fests.length) {
            cell.classList.add('is-fest');
            cell.title = k + ' · ' + fests.join('、');
            cell.appendChild(el('span', 'hb-cal-fest', fests[0]));
          }
        }

        var items = store[k];
        if (items && items.length) {
          cell.classList.add('has-note');
          var dots = el('span', 'hb-cal-dots');
          for (var d = 0; d < Math.min(items.length, 3); d++) dots.appendChild(el('i', 'hb-cal-dot'));
          cell.appendChild(dots);
        }

        grid.appendChild(cell);
      }
    }

    /* ---------- 右侧：这个月的日程 ---------- */
    function renderMonthList() {
      listWrap.innerHTML = '';

      /* 尾巴上补一行「本月特别的日子」，接在日程清单后面 */
      function appendFests() {
        var ym = view.getFullYear();
        var mm = view.getMonth() + 1;
        var last = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        var found = [];
        for (var d = 1; d <= last; d++) {
          var names = festivalsOf(ym, mm, d);
          if (names.length) found.push(d + ' 日 ' + names.join('/'));
        }
        if (!found.length) return;
        var box = el('div', 'hb-cal-festbox');
        box.appendChild(el('h4', 'hb-cal-festbox-title', '本月特别的日子'));
        found.forEach(function (t) { box.appendChild(el('span', 'hb-cal-festchip', t)); });
        listWrap.appendChild(box);
      }

      var head2 = el('h3', 'hb-cal-side-title', '这个月的日程');
      listWrap.appendChild(head2);

      var prefix = view.getFullYear() + '-' + pad(view.getMonth() + 1) + '-';
      var keys = Object.keys(store).filter(function (k) {
        return k.indexOf(prefix) === 0 && store[k] && store[k].length;
      }).sort();

      if (!keys.length) {
        listWrap.appendChild(el('p', 'hb-cal-empty', loaded ? '本月暂未发布日程。' : '日程暂时未能加载，请刷新页面重试。'));
        appendFests();
        return;
      }

      var ul = el('ul', 'hb-cal-list');
      keys.forEach(function (k) {
        store[k].forEach(function (item, idx) {
          var li = el('li', 'hb-cal-item');
          var btn = el('button', 'hb-cal-item-btn');
          btn.type = 'button';
          var when = el('span', 'hb-cal-item-when', k.slice(5).replace('-', '/') + (item.time ? ' ' + item.time : ''));
          var what = el('span', 'hb-cal-item-what', item.title || '(未命名)');
          btn.appendChild(when);
          btn.appendChild(what);
          btn.addEventListener('click', function () {
            var parts = k.split('-');
            view = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
            selected = k;
            renderGrid();
            renderMonthList();
            renderDay(idx);
          });
          li.appendChild(btn);
          ul.appendChild(li);
        });
      });
      listWrap.appendChild(ul);
      appendFests();
    }

    /* ---------- 所选日期的公开详情 ---------- */
    function renderDay(focusIndex) {
      editor.innerHTML = '';
      editor.appendChild(el('h3', 'hb-cal-side-title', selected + ' · 公开安排'));
      var items = store[selected] || [];
      if (!items.length) {
        editor.appendChild(el('p', 'hb-cal-empty', loaded ? '这一天暂无公开安排。' : '日程暂时未能加载。'));
        return;
      }
      var list = el('ul', 'hb-cal-notes');
      items.forEach(function (item, index) {
        var note = el('li', 'hb-cal-note');
        var heading = el('div', 'hb-cal-note-top');
        heading.appendChild(el('span', 'hb-cal-note-time', item.time || '全天'));
        heading.appendChild(el('b', 'hb-cal-note-title', item.title));
        note.appendChild(heading);
        if (item.note) note.appendChild(el('p', 'hb-cal-note-body', item.note));
        if (index === focusIndex) note.classList.add('is-focus');
        list.appendChild(note);
      });
      editor.appendChild(list);
    }

    /* ---------- 交互 ---------- */
    grid.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.hb-cal-day') : null;
      if (!cell) return;
      selected = cell.dataset.date;
      var parts = selected.split('-');
      var m = Number(parts[1]) - 1;
      if (Number(parts[0]) !== view.getFullYear() || m !== view.getMonth()) {
        view = new Date(Number(parts[0]), m, 1);
      }
      renderGrid();
      renderMonthList();
      renderDay();
    });

    prev.addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      selected = keyOf(view.getFullYear(), view.getMonth(), 1);
      renderGrid();
      renderMonthList();
      renderDay();
    });

    next.addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      selected = keyOf(view.getFullYear(), view.getMonth(), 1);
      renderGrid();
      renderMonthList();
      renderDay();
    });

    todayBtn.addEventListener('click', function () {
      var t = new Date();
      view = new Date(t.getFullYear(), t.getMonth(), 1);
      selected = todayKey();
      renderGrid();
      renderMonthList();
      renderDay();
    });

    // Keep earlier browser-only records recoverable without adding them to the public schedule.
    try {
      var oldRecords = localStorage.getItem('hb-calendar-v1');
      var oldData = oldRecords ? JSON.parse(oldRecords) : null;
      if (oldData && typeof oldData === 'object' && !Array.isArray(oldData) && Object.keys(oldData).length) {
        var legacy = el('details', 'hb-cal-legacy');
        legacy.appendChild(el('summary', '', '旧版本机记录'));
        legacy.appendChild(el('p', 'hb-cal-hint', '旧版记录仍保存在这个浏览器中，可在这里导出备份。'));
        var exportOld = el('button', 'hb-cal-mini', '导出本机旧记录');
        exportOld.type = 'button';
        exportOld.addEventListener('click', function () {
          var file = new Blob([oldRecords], {type: 'application/json'});
          var link = document.createElement('a');
          link.href = URL.createObjectURL(file);
          link.download = 'local-schedule-backup-' + todayKey() + '.json';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
        });
        legacy.appendChild(exportOld);
        mount.appendChild(legacy);
      }
    } catch (error) { /* Public schedules also work when browser storage is unavailable. */ }

    renderGrid();
    renderMonthList();
    renderDay();
  });
})();
