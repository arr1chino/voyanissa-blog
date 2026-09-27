/* ===== 定位天气 =====
   步骤：先问浏览器要位置（会弹一次「允许获取位置吗」），拿到经纬度之后
   去 Open-Meteo 换当地实况天气；浏览器不给位置（或用了不支持定位的浏览器）
   就退回按网络出口 IP 猜个大概城市，总之这张卡不会是空的。
   全是免费的公开接口，不需要任何密钥。
   想手动刷新，点一下这张卡就行。 */
(function () {
  'use strict';

  var GEO_OPTS = { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 };
  var WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_API = 'https://api-bdc.io/data/reverse-geocode-client';
  /* 按网络出口 IP 猜位置：这几家轮流试，前面那家偶尔会限速（返回 429），
     换下一家就行；全都不行才认输。 */
  var IP_APIS = [
    ['https://ipwho.is/', function (d) { return d && d.success !== false ? { lat: d.latitude, lon: d.longitude, city: d.city || d.region || '' } : null; }],
    ['https://api.ip.sb/geoip', function (d) { return d && typeof d.latitude === 'number' ? { lat: d.latitude, lon: d.longitude, city: d.city || d.region || '' } : null; }],
    ['https://ipinfo.io/json', function (d) {
      if (!d || !d.loc) return null;
      var p = String(d.loc).split(',');
      return { lat: Number(p[0]), lon: Number(p[1]), city: d.city || d.region || '' };
    }]
  ];

  /* 天气代码 → 中文说法 + 图标。数字是国际通用的 WMO 天气代码。 */
  var CODES = {
    0: ['晴', 'fa-sun'],
    1: ['大致晴朗', 'fa-sun'],
    2: ['多云', 'fa-cloud-sun'],
    3: ['阴', 'fa-cloud'],
    45: ['有雾', 'fa-smog'],
    48: ['雾凇', 'fa-smog'],
    51: ['毛毛雨', 'fa-cloud-rain'],
    53: ['小雨', 'fa-cloud-rain'],
    55: ['中雨', 'fa-cloud-rain'],
    56: ['冻毛毛雨', 'fa-cloud-rain'],
    57: ['冻雨', 'fa-cloud-rain'],
    61: ['小雨', 'fa-cloud-rain'],
    63: ['中雨', 'fa-cloud-showers-heavy'],
    65: ['大雨', 'fa-cloud-showers-heavy'],
    66: ['冻雨', 'fa-cloud-rain'],
    67: ['强冻雨', 'fa-cloud-showers-heavy'],
    71: ['小雪', 'fa-snowflake'],
    73: ['中雪', 'fa-snowflake'],
    75: ['大雪', 'fa-snowflake'],
    77: ['雪粒', 'fa-snowflake'],
    80: ['阵雨', 'fa-cloud-rain'],
    81: ['强阵雨', 'fa-cloud-showers-heavy'],
    82: ['暴雨', 'fa-cloud-showers-heavy'],
    85: ['阵雪', 'fa-snowflake'],
    86: ['强阵雪', 'fa-snowflake'],
    95: ['雷阵雨', 'fa-cloud-bolt'],
    96: ['雷阵雨伴冰雹', 'fa-cloud-bolt'],
    99: ['强雷暴伴冰雹', 'fa-cloud-bolt']
  };

  function describe(code) {
    return CODES[code] || ['天气数据', 'fa-cloud'];
  }

  function fetchJson(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 9000);
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (data) { clearTimeout(timer); return data; })
      .catch(function (err) { clearTimeout(timer); throw err; });
  }

  /* 浏览器定位：成功给 {lat, lon}，任何一步失败都 reject */
  function byBrowser() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, exact: true }); },
        function (err) { reject(err); },
        GEO_OPTS
      );
    });
  }

  /* 退路：按网络出口 IP 猜一个大概位置（挨个试，谁先给算谁的） */
  function byIp() {
    var i = 0;
    function attempt() {
      if (i >= IP_APIS.length) return Promise.reject(new Error('ip lookup failed'));
      var entry = IP_APIS[i++];
      return fetchJson(entry[0], 7000).then(function (d) {
        var pos = entry[1](d);
        if (!pos || typeof pos.lat !== 'number' || !isFinite(pos.lat) || !isFinite(pos.lon)) {
          throw new Error('bad ip payload');
        }
        pos.exact = false;
        return pos;
      }).catch(function () { return attempt(); });
    }
    return attempt();
  }

  function cityName(lat, lon) {
    return fetchJson(GEOCODE_API + '?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=zh', 8000)
      .then(function (d) {
        var city = d.city || d.locality || d.principalSubdivision || '';
        var region = d.principalSubdivision || '';
        if (city && region && city !== region) return city + ' · ' + region;
        return city || region || '';
      })
      .catch(function () { return ''; });
  }

  function weatherAt(lat, lon) {
    var url = WEATHER_API + '?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&timezone=auto';
    return fetchJson(url, 9000);
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var card = document.getElementById('hb-weather-card');
    if (!card) return;

    var iconEl = document.getElementById('hb-weather-icon');
    var tempEl = document.getElementById('hb-weather-temp');
    var cityEl = document.getElementById('hb-weather-city');
    var descEl = document.getElementById('hb-weather-desc');
    var footEl = document.getElementById('hb-weather-foot');
    var busy = false;

    function setIcon(cls) {
      if (!iconEl) return;
      iconEl.className = 'fas ' + cls;
    }

    function say(text) {
      if (cityEl) cityEl.textContent = text;
    }

    function load() {
      if (busy) return;
      busy = true;
      card.classList.add('is-loading');
      say('正在定位…');
      if (descEl) descEl.textContent = '要先问一下浏览器你在哪儿';
      if (footEl) footEl.textContent = '';

      byBrowser()
        .catch(function () { return byIp(); })
        .then(function (pos) {
          /* 城市名和天气一起问，谁先回来都行 */
          var city = pos.city ? Promise.resolve(pos.city) : cityName(pos.lat, pos.lon);
          return Promise.all([weatherAt(pos.lat, pos.lon), city, pos.exact]);
        })
        .then(function (r) {
          var data = r[0];
          var city = r[1];
          var exact = r[2];
          var cur = data && data.current;
          if (!cur) throw new Error('no current weather');

          var info = describe(cur.weather_code);
          var night = cur.is_day === 0;

          setIcon(info[1] === 'fa-sun' && night ? 'fa-moon' : info[1]);
          if (tempEl) tempEl.textContent = Math.round(cur.temperature_2m) + '°';
          say(city || '当前位置');
          if (descEl) {
            var bits = [info[0]];
            if (typeof cur.apparent_temperature === 'number') bits.push('体感 ' + Math.round(cur.apparent_temperature) + '°');
            if (typeof cur.relative_humidity_2m === 'number') bits.push('湿度 ' + Math.round(cur.relative_humidity_2m) + '%');
            descEl.textContent = bits.join(' · ');
          }
          if (footEl) {
            footEl.textContent = (exact ? '来自浏览器定位' : '定位不可用，按网络位置估算') + ' · 点一下刷新';
          }
          card.classList.remove('is-error');
        })
        .catch(function () {
          setIcon('fa-cloud');
          if (tempEl) tempEl.textContent = '—';
          say('暂时拿不到天气');
          if (descEl) descEl.textContent = '网络或定位接口没回应，稍后点一下再试';
          if (footEl) footEl.textContent = '点一下重新获取';
          card.classList.add('is-error');
        })
        .then(function () {
          busy = false;
          card.classList.remove('is-loading');
        });
    }

    card.addEventListener('click', load);
    load();
  });
})();
