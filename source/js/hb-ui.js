/* ===== 整站的两个小零件（每一页都会加载） =====
   1) 右下角三个小圆钮：回到顶部 / 白天黑夜切换 / 回博客第一页。
      第三个钮（水波那个）落点是首页那张白卡 —— 也就是「最新文章」列表的第一页。
      在首页就直接滚过去；在文章页 / 日历页这些地方，先按 href 回首页（URL 带 #blog），
      落回来之后再靠 maybeAutoBlog() 滚到卡片上。
   2) 深海底色：不是首页的那些页（文章页、日历页…）也铺上同一片流光蓝，
      内容卡片还是白的浮在上面 —— 这样整站看着是同一个人做的。

   黑白模式：记住上次的选择（存在浏览器自己的 localStorage 里），
   刷新之后还是你上次选的那个。一次都没选过的访客默认进黑夜模式。
   真正的开关在 <html> 上的两个属性：data-theme 交给主题的配色用，
   hb-dark 是我自己那几块（首页的卡片、流光蓝）用。 */
(function () {
  'use strict';

  var KEY = 'hb-theme';
  var root = document.documentElement;

  function readTheme() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch (e) { /* 隐私模式下读不到就算了 */ }
    return 'dark';
  }

  function paintTheme(mode) {
    var dark = mode === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('hb-dark', dark);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#071722' : '#ffffff');

    var btn = document.getElementById('hb-fab-theme');
    if (btn) {
      var icon = btn.querySelector('i');
      if (icon) icon.className = 'fas ' + (dark ? 'fa-sun' : 'fa-moon');
      btn.setAttribute('title', dark ? '切换到白天模式' : '切换到黑夜模式');
      btn.setAttribute('aria-label', btn.getAttribute('title'));
    }
  }

  function saveTheme(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* 存不了就算了，本次有效 */ }
  }

  /* 首页的滚动是 Lenis 接管的，window.scrollTo 会被拽回去，所以优先走它的接口 */
  function toTop() {
    if (window.__hero && typeof window.__hero.scrollTo === 'function') {
      window.__hero.scrollTo(0, { duration: 0.9 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ===== 第三个钮：去博客第一页 =====
     「博客第一页」就是首页那张白卡（.hero-tab-card，里面是「最新文章」三列），
     不在这页上（文章页、日历页…）的时候先去不了，靠下面的自动跳补上。 */
  function blogCard() {
    return document.querySelector('.hero-tab-card') || document.querySelector('.hero-after');
  }

  function toBlog(opt) {
    var card = blogCard();
    if (!card) return false;
    var instant = opt && opt.instant;
    // 14px 的余量：卡片顶边正好贴住导航那行字，不贴着视口最上沿
    var y = Math.max(0, Math.round(card.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0) - 14));
    if (window.__hero && typeof window.__hero.scrollTo === 'function' && !instant) {
      window.__hero.scrollTo(y, { duration: 1.1 });
    } else if (window.__hero && typeof window.__hero.jump === 'function') {
      window.__hero.jump(y);
    } else if (instant) {
      window.scrollTo(0, y);
    } else {
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    return true;
  }

  /* 从别的页面点那个钮过来：URL 上带着 #blog，落回来后再补一次跳转。
     首页的 3D 是异步加载的，卡片的位置要等 .hero-scroll 撑起来才算得准，
     所以这里等 __hero 就位（最多等 8 秒，等不到就放弃）。 */
  function maybeAutoBlog() {
    if (location.hash !== '#blog') return;
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 40) { clearInterval(timer); return; }
      if (!window.__hero || typeof window.__hero.jump !== 'function') return;
      clearInterval(timer);
      setTimeout(function () { toBlog({ instant: true }); }, 260);
    }, 200);
  }

  function buildButtons() {
    if (document.getElementById('hb-fabs')) return;

    var box = document.createElement('div');
    box.className = 'hb-fabs';
    box.id = 'hb-fabs';
    box.innerHTML =
      '<button id="hb-fab-top" class="hb-fab" type="button" title="回到顶部" aria-label="回到顶部">' +
        '<i class="fas fa-arrow-up"></i></button>' +
      '<button id="hb-fab-theme" class="hb-fab" type="button" title="切换到黑夜模式" aria-label="切换到黑夜模式">' +
        '<i class="fas fa-moon"></i></button>' +
      '<a id="hb-fab-home" class="hb-fab" href="/#blog" title="回到博客第一页" aria-label="回到博客第一页">' +
        '<i class="fas fa-water"></i></a>';
    document.body.appendChild(box);

    document.getElementById('hb-fab-top').addEventListener('click', toTop);
    document.getElementById('hb-fab-theme').addEventListener('click', function () {
      var next = root.classList.contains('hb-dark') ? 'light' : 'dark';
      saveTheme(next);
      paintTheme(next);
      window.dispatchEvent(new CustomEvent('hb-theme-change', { detail: next }));
    });
    // 在首页（能滚到卡片）就拦下来自己滚，省一次白屏重载
    document.getElementById('hb-fab-home').addEventListener('click', function (e) {
      if (toBlog()) e.preventDefault();
    });
  }

  /* 不是首页就把那片流光蓝铺上：body 最前面插一个跟首页同一个 .hero-flow */
  function buildOcean() {
    if (root.classList.contains('hero-mode')) return;
    root.classList.add('hb-ocean');
    var flow = document.createElement('div');
    flow.className = 'hero-flow';
    document.body.insertBefore(flow, document.body.firstChild);
  }

  /* 右边那条滚动条：鼠标贴到窗口最右边时，给她贴个记号，
     让滑块「吸」地胀开一点，按住拖动再胀一档（在 css 里）。
     鼠标一旦压到滚动条上，网页这边就收不到移动事件了，
     所以判定线取「离右边还差 1px」——效果上就是光标一贴边就触发。 */
  function bindScrollbar() {
    var hot = false, drag = false;

    function paint() {
      root.classList.toggle('is-sb-hot', hot);
      root.classList.toggle('is-sb-drag', drag);
    }

    document.addEventListener('mousemove', function (e) {
      var near = e.clientX >= root.clientWidth - 1;
      if (near !== hot) { hot = near; paint(); }
    }, { passive: true });

    document.addEventListener('mousedown', function () {
      if (hot && !drag) { drag = true; paint(); }
    }, true);

    document.addEventListener('mouseup', function () {
      if (drag) { drag = false; paint(); }
    }, true);

    function reset() {
      if (!hot && !drag) return;
      hot = false; drag = false; paint();
    }
    document.addEventListener('mouseleave', reset);
    window.addEventListener('blur', reset);
  }

  /* ===== 页脚平台方块里的「点一下复制」 =====
     抖音 / B站 / QQ / GitHub 是真链接，点了直接跳走，用不到下面这套。
     微信压根没有「网页跳微信」这种东西，原神那一行也只是我的 UID，
     两个都跳不了 —— 所以给它们改成：点一下把号码复制到剪贴板，
     再从屏幕下方飘一条小提示，告诉访客「复制好了，去微信搜这个就行」。

     用法：给任意元素挂 data-hb-copy="要复制的内容"，
     想自定义提示语就再加 data-hb-copy-tip="……"。
     只挂 data-hb-copy、没有 href 的元素也能点。 */
  function showToast(msg) {
    var box = document.getElementById('hb-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hb-toast';
      box.className = 'hb-toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    box.textContent = msg;
    // 先摘掉再戴上，连续点两次才会重新播一遍淡入，不会僵在那里
    box.classList.remove('is-on');
    void box.offsetWidth;
    box.classList.add('is-on');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { box.classList.remove('is-on'); }, 2800);
  }

  function copyText(text) {
    /* 老浏览器、或者 http 页面里没有 navigator.clipboard，
       就拿一个看不见的输入框选中再 execCommand 兜一下。 */
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 复制不了就算了，提示照样弹 */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    fallback();
    return Promise.resolve();
  }

  function bindCopyRows() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-hb-copy]') : null;
      if (!el) return;
      var text = el.getAttribute('data-hb-copy');
      if (!text) return;
      // 这类行的 href 写的是 '#'，不拦一下的话点完会「嗖」地跳回页首
      var href = el.getAttribute('href');
      if (!href || href === '#') e.preventDefault();
      copyText(text).then(function () {
        showToast(el.getAttribute('data-hb-copy-tip') || ('已复制：' + text));
      });
    });
  }

  /* 左上角那块「本页名字 ⇄ 返回首页」的翻转（样式在 css/hero.css）。
     r130：文章页 / 日历页 / 聊天页 / 标签页……除了首页，每一页都是这一枚，
     所以这里用 id 直接抓，不挑页面。
     只靠 CSS 的 :hover 在真机上会有几率不翻：
     ① 指针擦着文字上下边缘走的时候，悬停判定容易掉，掉了动画就往回弹；
     ② 首屏如果鼠标本来就停在那个位置，遮罩撤走时鼠标没动，
        浏览器不一定重算悬停，停在那儿就是不翻。
     这里干脆自己按位置判：记住指针停在哪，拿标题那块**不动的**矩形比一下，
     命中就挂 is-flip（和 :hover 一个效果），离开就摘掉。 */
  function bindTitleFlip() {
    var link = document.querySelector('#blog-info > .nav-page-title');
    if (!link || link.getAttribute('data-hb-flip') === '1') return;
    link.setAttribute('data-hb-flip', '1');

    var px = null;
    var py = null;
    var ticking = false;

    function inside() {
      if (px === null) return null;
      var r = link.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      /* 横向各留 6px、纵向各留 14px 的富余：手停在字边上、停得略高略低都算停上了，
         比浏览器自己那个正好贴着文字的判定框宽容一点。 */
      return px >= r.left - 6 && px <= r.right + 6 && py >= r.top - 14 && py <= r.bottom + 14;
    }

    function sync() {
      ticking = false;
      var on = inside();
      if (on === null) return;
      link.classList.toggle('is-flip', on);
    }

    function queue() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sync);
    }

    link.addEventListener('mouseenter', function () { link.classList.add('is-flip'); });
    link.addEventListener('focus', function () { link.classList.add('is-flip'); });
    link.addEventListener('blur', function () { link.classList.remove('is-flip'); });

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
      queue();
    }, { passive: true });

    /* 指针整个离开窗口、或者切走标签页之后就收不到移动了，得自己收尾，
       不然回来时那一下会一直翻着。 */
    document.addEventListener('mouseleave', function () {
      px = null;
      link.classList.remove('is-flip');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { px = null; link.classList.remove('is-flip'); }
    });

    /* 「鼠标没动、页面却动了」的几秒（加载遮罩撤走、顶栏滑进来、窗口改大小）
       再主动补判几次，用的还是刚才记下的那个指针位置。 */
    window.addEventListener('load', queue);
    window.addEventListener('resize', queue);
    window.addEventListener('scroll', queue, { passive: true });
    var rounds = 0;
    var timer = setInterval(function () {
      sync();
      if (++rounds >= 10) clearInterval(timer);
    }, 400);
  }

  function boot() {
    paintTheme(readTheme());
    buildOcean();
    buildButtons();
    maybeAutoBlog();
    bindScrollbar();
    bindCopyRows();
    bindTitleFlip();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
