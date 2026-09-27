/* ===== 栏目里的几个小挂件 =====
   1) 友情链接（左栏，资料卡下面）：清单在下面的 FRIENDS 里，改那一份就行。
   2) 今日一言（右栏）：进页面自动拉一句「一言」，点卡片再换一句。
   3) 随机音乐（右栏）：进页面随机挑一首，点一下再随机换一首，
      声音走网易云的「外链直连」，播放器本身藏起来，画面上只有自己画的那条进度条。
   定位天气是单独一份（/js/hb-weather.js）。
   找不到对应元素就静静地什么都不做，不会报错。 */
(function () {
  'use strict';

  var QUOTE_API = 'https://v1.hitokoto.cn/?c=d&c=i&c=k&encode=json';

  /* 万一现场没网、或者一言接口抽风，这些句子顶上，
     保证「点一下换一句」永远有反应，不会点半天不动。 */
  var QUOTE_BACKUP = [
    { text: '海是倒过来的天。', from: '' },
    { text: '流水不争先，争的是滔滔不绝。', from: '' },
    { text: '心之所向，素履以往；生如逆旅，一苇以航。', from: '木心' },
    { text: '时间是最好的作者，它总会写出完美的结局。', from: '卓别林' },
    { text: '万物皆有裂痕，那是光照进来的地方。', from: '莱昂纳德·科恩' },
    { text: '要么庸俗，要么孤独。', from: '叔本华' },
    { text: '与其感慨路难行，不如马上出发。', from: '' },
    { text: '我已见过银河，但我只爱一颗星。', from: '' },
    { text: '海到无边天作岸，山登绝顶我为峰。', from: '林则徐' },
    { text: '生活明朗，万物可爱。', from: '' },
    { text: '慢慢来，比较快。', from: '' },
    { text: '愿有岁月可回首，且以深情共白头。', from: '' }
  ];

  /* ============================================================
     ↓↓↓ 友情链接：一行一个，想加谁就照着格式加一行 ↓↓↓
     name = 博客名字（显示在图标后面），url = 网址
     图标是自动抓对方网站的标签页小图标，抓不到就显示名字第一个字。
     ============================================================ */
  var FRIENDS = [
    { name: '创客空间', url: 'https://bistumaker.cn/' },
    { name: '原神 · 官方网站', url: 'https://ys.mihoyo.com/' }
  ];

  /* ============================================================
     每日三首：曲库在 js/hb-songs.js 里（几百首，都是「不用会员也能放」的，
     逐首验证过）。这里只负责按天发牌、三首一组地摆到卡片上。
     ============================================================ */
  var COVERS = window.HB_COVERS || [];
  var SONGS = (window.HB_SONGS || []).map(function (r) {
    return { id: r[0], name: r[1], artist: r[2], cover: COVERS[r[3]] || '' };
  });
  /* 清单万一没加载上，卡片也别空着 */
  if (!SONGS.length) {
    SONGS = [{ id: '1492276411', name: '璃月 Liyue', artist: '陈致逸 / HOYO-MiX', cover: '' }];
  }
  var BATCH = 3;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ---------- 友情链接 ---------- */
  function buildFriends() {
    var list = document.getElementById('hb-links-list');
    if (!list || !FRIENDS.length) return;

    FRIENDS.forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'hb-link';
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = item.name;

      var iconBox = document.createElement('span');
      iconBox.className = 'hb-link-icon';

      var letter = document.createElement('span');
      letter.className = 'hb-link-fallback';
      letter.textContent = (item.name || '?').trim().charAt(0);
      iconBox.appendChild(letter);

      var host = '';
      try { host = new URL(item.url).hostname; } catch (e) { host = ''; }
      if (host) {
        var img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.src = 'https://favicon.im/' + host;
        /* 抓不到图标就把那张图藏掉，露出底下的首字母 */
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
        iconBox.appendChild(img);
      }

      var name = document.createElement('span');
      name.className = 'hb-link-name';
      name.textContent = item.name;

      a.appendChild(iconBox);
      a.appendChild(name);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  /* ---------- 每日三首 ---------- */
  /* 播放地址走网易云的「外链直连」：每次换歌现问一次，拿回来一条带时效的真实音频地址，
     交给藏在这张卡里那个看不见的播放器去放。好处是画面上不会再冒出网易云官方那个
     白框播放器 —— 进度条、时间、播放键全是照卡片的样子自己画的。
     拿不到地址的（会员曲 / 下架曲）会自动跳下一首；连着几首都放不出来才认输，
     在卡片底下留一个「去网易云听」的出口，不至于点了没反应。 */
  var MUSIC_STREAM = 'https://music.163.com/song/media/outer/url?id=';
  var MUSIC_HINT = '点歌名直接播 · 三首放完自动换下一组';

  /* ---- 发牌：同一天进来先看到的都是同一组（卡片上写「每日三首」的由来）----
     说明白点：这是咱们自己在曲库里按日期洗牌发牌，不是网易云那个要登录才给的
     真·每日推荐 —— 静态网页够不着人家那个接口，能做到的是「天天不重样」。 */
  function daySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, seed) {
    var a = list.slice();
    var r = rng(seed);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 一副牌 = 整个曲库洗一遍，三张一发。
     发到底了就重新洗一副（这回用当时的时钟当种子，所以跟今天开头那副不一样）。 */
  function deck() {
    var order = shuffled(SONGS, daySeed());
    var at = 0;
    return {
      deal: function () {
        if (at + BATCH > order.length) {
          order = shuffled(SONGS, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
          at = 0;
        }
        var out = order.slice(at, at + BATCH);
        at += BATCH;
        return out;
      }
    };
  }

  /* 秒数 → 3:07 这种样子；还没拿到长度就先显示 --:-- */
  function clock(sec) {
    if (!isFinite(sec) || sec < 0) return '--:--';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function buildMusic() {
    var card = document.getElementById('hb-music-card');
    var audio = document.getElementById('hb-music-audio');
    var coverEl = document.getElementById('hb-music-cover');
    var nameEl = document.getElementById('hb-music-name');
    var artistEl = document.getElementById('hb-music-artist');
    var toggleEl = document.getElementById('hb-music-toggle');
    var listEl = document.getElementById('hb-music-batch');
    var moreEl = document.getElementById('hb-music-more');
    var noteEl = document.getElementById('hb-music-note');
    var barEl = document.getElementById('hb-music-bar');
    var fillEl = document.getElementById('hb-music-fill');
    var curEl = document.getElementById('hb-music-cur');
    var durEl = document.getElementById('hb-music-dur');
    if (!card || !nameEl) return;

    var hintEl = card.querySelector('.hb-card-hint');
    var pile = deck(); /* 今天这一副牌 */
    var batch = []; /* 卡片上正摆着的那三首 */
    var rows = {}; /* 歌曲编号 → 卡片上那一行 */
    var current = null; /* 正在播的那首 */
    var pending = null; /* 已经交给播放器、还在等回话的那首 */
    var misses = 0; /* 连着几首放不出来 */
    var batchNo = 0; /* 今天翻到第几组了 */

    /* 封面优先用真的专辑图；万一取不到，就按歌曲编号推一个渐变色顶着 */
    function paint(el, song) {
      if (!el) return;
      if (song.cover) { el.style.backgroundImage = 'url("' + song.cover + '")'; return; }
      var h = 0;
      for (var i = 0; i < song.id.length; i++) h = (h * 31 + song.id.charCodeAt(i)) % 360;
      el.style.backgroundImage = 'linear-gradient(135deg,hsl(' + h + ',42%,34%),hsl(' +
        ((h + 38) % 360) + ',56%,68%))';
    }

    function playing() { return audio && !audio.paused; }

    function face(cls) {
      var i = toggleEl && toggleEl.firstElementChild;
      if (i) i.className = 'fas ' + cls;
    }

    function playIt() {
      var p = audio.play();
      /* 浏览器不让自动出声（还没点过页面）时把图标退回去，别装作在放 */
      if (p && p.catch) p.catch(function () { face('fa-play'); });
    }

    function bar(ratio) {
      if (fillEl) fillEl.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
    }

    function times(cur, dur) {
      if (curEl) curEl.textContent = clock(cur);
      if (durEl) durEl.textContent = clock(dur);
    }

    /* 三首摆上卡片。每一行都是「封面 + 歌名/歌手 + 一个播放小圆钮」。 */
    function drawBatch() {
      if (!listEl) return;
      listEl.innerHTML = '';
      rows = {};
      batch.forEach(function (song) {
        var li = document.createElement('li');
        li.className = 'hb-music-item';
        li.setAttribute('data-id', song.id);

        var cov = document.createElement('span');
        cov.className = 'hb-music-cover';
        paint(cov, song);

        var info = document.createElement('span');
        info.className = 'hb-music-info';
        var b = document.createElement('b');
        b.textContent = song.name;
        var sp = document.createElement('span');
        sp.textContent = song.artist;
        info.appendChild(b);
        info.appendChild(sp);

        var btn = document.createElement('span');
        btn.className = 'hb-music-play';
        var icon = document.createElement('i');
        icon.className = 'fas fa-play';
        btn.appendChild(icon);

        li.appendChild(cov);
        li.appendChild(info);
        li.appendChild(btn);
        listEl.appendChild(li);
        rows[song.id] = li;
      });
      markRows();
    }

    /* 正在播的那行高亮、并且把它的图标换成暂停键 */
    function markRows() {
      batch.forEach(function (song) {
        var li = rows[song.id];
        if (!li) return;
        var on = !!(current && song.id === current.id);
        li.classList.toggle('is-active', on);
        var icon = li.querySelector('.hb-music-play i');
        if (icon) icon.className = 'fas ' + (on && playing() ? 'fa-pause' : 'fa-play');
      });
    }

    /* 把一首歌真正画到卡片上（名字 / 封面 / 进度条归零）。 */
    function show(song) {
      current = song;
      paint(coverEl, song);
      if (artistEl) artistEl.textContent = song.artist;
      nameEl.textContent = song.name;
      /* 换歌时名字轻轻跳一下，让人知道「换过了」 */
      nameEl.classList.remove('is-swap');
      void nameEl.offsetWidth;
      nameEl.classList.add('is-swap');

      bar(0);
      times(0, NaN);
      if (hintEl) hintEl.textContent = MUSIC_HINT;
      card.classList.remove('is-miss', 'is-loading');
      markRows();
    }

    /* 把一首歌交给藏在卡里的播放器去取，但先不画到卡片上 ——
       等播放器回话（loadedmetadata）确认这首歌真能放，再改名字和封面。
       会员曲 / 下架曲网易云那边给不出音频，会走进 error 里悄悄再挑下一首；
       因为名字一直没动过，看着就是「点一下 → 直接换成能放的那首」，
       不会有「先闪一个新名字、紧接着又跳走」那种点一次跳两下的感觉。
       等回话的这段时间先让名字淡一点，表示「在取了」。 */
    function feed(song, autoplay) {
      pending = song;
      if (!audio) { pending = null; show(song); return; }
      card.classList.add('is-loading');
      audio.src = MUSIC_STREAM + encodeURIComponent(song.id) + '.mp3';
      audio.load();
      if (autoplay) playIt();
    }

    /* 一批三首摆上去；要接着放就把第一首推给播放器 */
    function nextBatch(autoplay) {
      batch = pile.deal();
      batchNo++;
      drawBatch();
      if (noteEl) {
        noteEl.textContent = '第 ' + batchNo + ' 组 · 曲库共 ' + SONGS.length + ' 首';
      }
      if (autoplay) feed(batch[0], true);
      return batch;
    }

    /* 播放这一批里的第 n 首（越界就当作这一批放完了） */
    function playAt(n, autoplay) {
      if (n < 0 || n >= batch.length) { nextBatch(autoplay); return; }
      feed(batch[n], autoplay);
    }

    function indexOf(song) {
      if (!song) return -1;
      for (var i = 0; i < batch.length; i++) if (batch[i].id === song.id) return i;
      return -1;
    }

    /* 开场：先把今天这三首摆出来，再把第一首喂给播放器等着（不自动出声）。 */
    nextBatch(false);
    if (!audio) { show(batch[0]); return; }
    show(batch[0]);
    feed(batch[0], false);

    audio.addEventListener('play', function () {
      face('fa-pause'); card.classList.add('is-playing'); markRows();
    });
    audio.addEventListener('pause', function () {
      face('fa-play'); card.classList.remove('is-playing'); markRows();
    });
    audio.addEventListener('loadedmetadata', function () {
      misses = 0;
      /* 取到了：这时候才把名字换过来 */
      if (pending && pending !== current) {
        var ok = pending;
        pending = null;
        show(ok);
      } else {
        pending = null;
        card.classList.remove('is-loading');
      }
      times(audio.currentTime, audio.duration);
    });
    audio.addEventListener('timeupdate', function () {
      times(audio.currentTime, audio.duration);
      bar(audio.duration ? audio.currentTime / audio.duration : 0);
    });
    /* 一首放完就顺着这一批往下走；三首都放完了，自动换下一批接着放 */
    audio.addEventListener('ended', function () { playAt(indexOf(current) + 1, true); });
    audio.addEventListener('error', function () {
      var failed = pending || current;
      /* 连着几首都取不到就认输，在卡片底下留一个去网易云的出口 */
      if (misses >= 3) {
        pending = null;
        if (failed && failed !== current) show(failed);
        if (hintEl) {
          card.classList.add('is-miss');
          hintEl.innerHTML = '在线播放暂时取不到，<a href="https://music.163.com/#/song?id=' +
            encodeURIComponent(failed ? failed.id : '') + '" target="_blank" rel="noopener">去网易云听</a>';
        }
        return;
      }
      misses++;
      if (hintEl) hintEl.textContent = '这首放不出来，换下一首…';
      var at = indexOf(pending || current);
      /* 这一首取不到就往后顺延，顺延到头就换下一批 */
      playAt(at < 0 ? 0 : at + 1, playing());
    });

    /* 点卡片上哪一行就放哪一首；点正在放的那一首 = 暂停 / 继续 */
    if (listEl) {
      listEl.addEventListener('click', function (e) {
        var li = e.target && e.target.closest ? e.target.closest('.hb-music-item') : null;
        if (!li) return;
        var id = li.getAttribute('data-id');
        var song = null;
        for (var i = 0; i < batch.length; i++) if (batch[i].id === id) song = batch[i];
        if (!song) return;
        if (current && current.id === song.id) {
          if (audio.paused) playIt(); else audio.pause();
          return;
        }
        feed(song, true);
      });
    }

    /* 「换一批」：不动正在放的那首，只把下面三首换成新的 */
    if (moreEl) {
      moreEl.addEventListener('click', function (e) {
        e.stopPropagation();
        nextBatch(false);
        if (hintEl) hintEl.textContent = MUSIC_HINT;
      });
    }

    if (toggleEl) {
      toggleEl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (audio.paused) playIt();
        else audio.pause();
      });
    }

    /* 进度条：点哪儿跳哪儿，按住能拖，选中后用左右方向键也能挪 */
    if (barEl) {
      var dragging = false;

      function seekAt(clientX) {
        if (!audio.duration || !isFinite(audio.duration)) return;
        var r = barEl.getBoundingClientRect();
        if (!r.width) return;
        var ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        audio.currentTime = ratio * audio.duration;
        bar(ratio);
      }

      barEl.addEventListener('pointerdown', function (e) {
        dragging = true;
        barEl.classList.add('is-live');
        if (barEl.setPointerCapture) barEl.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
        e.stopPropagation();
      });
      barEl.addEventListener('pointermove', function (e) {
        if (dragging) { seekAt(e.clientX); e.stopPropagation(); }
      });
      barEl.addEventListener('pointerup', function (e) { dragging = false; e.stopPropagation(); });
      barEl.addEventListener('pointercancel', function () { dragging = false; });
      barEl.addEventListener('mouseleave', function () { if (!dragging) barEl.classList.remove('is-live'); });
      barEl.addEventListener('keydown', function (e) {
        if (!audio.duration || !isFinite(audio.duration)) return;
        var step = e.shiftKey ? 30 : 5;
        if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + step); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - step); e.preventDefault(); }
      });
    }
  }

  ready(function () {
    buildFriends();
    buildMusic();

    /* ---------- 今日一言 ----------
       上一版是「点一下 → 等接口回话 → 才换字」，接口慢的时候连点好几下
       也只换一句，看着就是坏的。这版改成：按下去立刻换（先用手上的存货或
       本地句子），同时在后台悄悄补货，真句子到了下一次点击就用真的。
       就算现场断网，这张卡也照样点得动、换得了。 */
    var quoteCard = document.getElementById('hb-quote-card');
    var quoteEl = document.getElementById('hb-hitokoto');
    var fromEl = document.getElementById('hb-hitokoto-from');

    var quoteQueue = [];
    var quoteNow = '';
    var quoteRecent = [];
    var quoteFetching = false;

    function paintQuote(text, from) {
      quoteNow = text;
      if (quoteEl) quoteEl.textContent = text;
      if (fromEl) fromEl.textContent = from ? '—— ' + from : '—— 一言';
      if (quoteEl) {
        /* 去掉再加，动画才能被反复触发 */
        quoteEl.classList.remove('is-swap');
        void quoteEl.offsetWidth;
        quoteEl.classList.add('is-swap');
      }
    }

    function refillQuote() {
      if (quoteFetching || quoteQueue.length >= 2) return;
      quoteFetching = true;

      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);

      fetch(QUOTE_API, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.hitokoto) throw new Error('empty');
          if (data.hitokoto !== quoteNow) {
            quoteQueue.push({ text: data.hitokoto, from: data.from_who || data.from || '' });
          }
        })
        .catch(function () { /* 拉不到就算了，本地句子兜着 */ })
        .then(function () {
          clearTimeout(timer);
          quoteFetching = false;
        });
    }

    function localQuote() {
      /* 最近说过的那几句先避开，免得连着点两下又撞回同一句 */
      var pool = QUOTE_BACKUP.filter(function (it) {
        return quoteRecent.indexOf(it.text) === -1;
      });
      if (!pool.length) pool = QUOTE_BACKUP.filter(function (it) { return it.text !== quoteNow; });
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function nextQuote() {
      var item = quoteQueue.shift() || localQuote();
      paintQuote(item.text, item.from);
      quoteRecent.push(item.text);
      if (quoteRecent.length > 4) quoteRecent.shift();
      refillQuote();
    }

    if (quoteCard && quoteEl) {
      quoteEl.classList.add('is-swap');
      quoteCard.addEventListener('click', nextQuote);
      refillQuote();
      setTimeout(nextQuote, 600);
    }
  });
})();
