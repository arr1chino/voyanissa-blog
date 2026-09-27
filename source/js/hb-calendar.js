/* ===== 日程日历 =====
   一个能自己批注的月历：点某一天 → 在下面写一条（可以写标题、时间、备注），
   存起来之后那一天会带上一个小圆点，右侧「这个月的日程」也会列出来。

   存在哪儿：浏览器自己的 localStorage（就是「这台电脑的这个浏览器」）。
   —— 换电脑、换浏览器、清缓存就看不到自己写的东西了，所以这不是多人共享的
   日历，是「你自己维护、给别人看」的公开日程板。要搬走或者备份，
   点右上角「导出」会下载一个 json 文件；「导入」再把那个文件读回来。

   想改默认那几条示例批注：删掉浏览器里的存储（或先导出备份），
   然后改下面 SEED 那份清单。 */
(function () {
  'use strict';

  var STORE_KEY = 'hb-calendar-v1';

  /* 第一次打开时空日历太干，先垫三条示例。日期用「距今几天」表示，
     所以不管哪天打开，示例都是「今天 / 三天后 / 十天后」。 */
  var SEED = [
    { offset: 0, time: '20:00', title: '把这个站点再检查一遍', note: '重点看手机上的排版' },
    { offset: 3, time: '14:00', title: '社团作品提交', note: '交上去之前记得导出一次备份' },
    { offset: 10, time: '10:30', title: '下一篇文章的素材整理', note: '' }
  ];

  var WEEK = ['一', '二', '三', '四', '五', '六', '日'];
  var MONTH_CN = ['一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

  function todayKey() {
    var t = new Date();
    return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function seedData() {
    var out = {};
    SEED.forEach(function (item) {
      var d = new Date();
      d.setDate(d.getDate() + item.offset);
      var k = keyOf(d.getFullYear(), d.getMonth(), d.getDate());
      out[k] = [{ time: item.time, title: item.title, note: item.note }];
    });
    return out;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') return data;
      }
    } catch (e) { /* 坏了就当空的 */ }
    return seedData();
  }

  function save(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* 存不了就算了 */ }
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

    var store = load();
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
    var exportBtn = el('button', 'hb-cal-mini', '导出');
    exportBtn.type = 'button';
    var importBtn = el('button', 'hb-cal-mini', '导入');
    importBtn.type = 'button';
    tools.appendChild(todayBtn);
    tools.appendChild(exportBtn);
    tools.appendChild(importBtn);

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
      '批注记在这台电脑的这个浏览器里（换设备 / 清缓存会丢），要留档点右上角「导出」。');
    mount.appendChild(hint);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    mount.appendChild(fileInput);

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
        listWrap.appendChild(el('p', 'hb-cal-empty', '这个月还没有安排，点某一天写一条吧。'));
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
            renderEditor(idx);
          });
          li.appendChild(btn);
          ul.appendChild(li);
        });
      });
      listWrap.appendChild(ul);
      appendFests();
    }

    /* ---------- 下面：写批注 ---------- */
    function renderEditor(focusIndex) {
      editor.innerHTML = '';
      var items = store[selected] || [];

      var bar = el('div', 'hb-cal-ed-head');
      bar.appendChild(el('h3', 'hb-cal-side-title', '批注 · ' + selected));
      var dayTools = el('div', 'hb-cal-tools');
      var clearBtn = el('button', 'hb-cal-mini', items.length > 1 ? '清空这一天' : '删除这一天');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', function () {
        if (!store[selected]) return;
        delete store[selected];
        save(store);
        renderGrid();
        renderMonthList();
        renderEditor();
      });
      dayTools.appendChild(clearBtn);
      bar.appendChild(dayTools);
      editor.appendChild(bar);

      if (items.length) {
        var ul = el('ul', 'hb-cal-notes');
        items.forEach(function (item, idx) {
          var li = el('li', 'hb-cal-note');
          var top = el('div', 'hb-cal-note-top');
          if (item.time) top.appendChild(el('span', 'hb-cal-note-time', item.time));
          top.appendChild(el('b', 'hb-cal-note-title', item.title || '(未命名)'));
          li.appendChild(top);
          if (item.note) li.appendChild(el('p', 'hb-cal-note-body', item.note));
          li.appendChild(makeDelete(function () {
            items.splice(idx, 1);
            if (!items.length) delete store[selected];
            save(store);
            renderGrid();
            renderMonthList();
            renderEditor();
          }));
          ul.appendChild(li);
        });
        editor.appendChild(ul);
      }

      /* 新增一条 */
      var form = el('div', 'hb-cal-form');
      var row = el('div', 'hb-cal-row');
      var timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.className = 'hb-cal-input hb-cal-input--time';
      timeInput.value = '20:00';
      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'hb-cal-input';
      titleInput.placeholder = '这天要做什么（比如：交作品）';
      titleInput.maxLength = 60;
      row.appendChild(timeInput);
      row.appendChild(titleInput);

      var noteInput = document.createElement('textarea');
      noteInput.className = 'hb-cal-input hb-cal-textarea';
      noteInput.placeholder = '补充说明（可留空）';
      noteInput.rows = 2;
      noteInput.maxLength = 300;

      var actions = el('div', 'hb-cal-actions');
      var addBtn = el('button', 'hb-cal-save', '保存这条批注');
      addBtn.type = 'button';
      actions.appendChild(addBtn);

      form.appendChild(row);
      form.appendChild(noteInput);
      form.appendChild(actions);
      editor.appendChild(form);

      function submit() {
        var text = titleInput.value.trim();
        if (!text) { titleInput.focus(); return; }
        if (!store[selected]) store[selected] = [];
        store[selected].push({ time: timeInput.value || '', title: text, note: noteInput.value.trim() });
        save(store);
        renderGrid();
        renderMonthList();
        renderEditor();
      }

      addBtn.addEventListener('click', submit);
      noteInput.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
      });

      if (focusIndex !== undefined) {
        var target = editor.querySelectorAll('.hb-cal-note')[focusIndex];
        if (target) target.classList.add('is-focus');
        else titleInput.focus();
      }
    }

    function makeDelete(onClick) {
      var btn = el('button', 'hb-cal-del');
      btn.type = 'button';
      btn.title = '删掉这条';
      btn.setAttribute('aria-label', '删掉这条');
      btn.innerHTML = '<i class="fas fa-xmark"></i>';
      btn.addEventListener('click', onClick);
      return btn;
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
      renderEditor();
    });

    prev.addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      renderGrid();
      renderMonthList();
    });

    next.addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      renderGrid();
      renderMonthList();
    });

    todayBtn.addEventListener('click', function () {
      var t = new Date();
      view = new Date(t.getFullYear(), t.getMonth(), 1);
      selected = todayKey();
      renderGrid();
      renderMonthList();
      renderEditor();
    });

    exportBtn.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'schedule-' + todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });

    importBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad file');
          store = data;
          save(store);
          renderGrid();
          renderMonthList();
          renderEditor();
        } catch (e) {
          window.alert('这个文件读不出来，确认一下是不是「导出」下来的那个 json。');
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    renderGrid();
    renderMonthList();
    renderEditor();
  });
})();
