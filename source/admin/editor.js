(function () {
  'use strict';
  const CMS = window.CMS;
  const loading = document.getElementById('editor-loading');
  if (!CMS) {
    loading.textContent = '后台文件加载失败，请刷新页面重试。';
    return;
  }
  const h = window.h || window.React?.createElement;
  if (h) {
    CMS.registerPreviewTemplate('posts', function (props) {
      const title = props.entry.getIn(['data', 'title']) || '未命名文章';
      const cover = props.entry.getIn(['data', 'cover']);
      const raw = props.entry.getIn(['data', 'bilibili']) || '';
      const bvid = String(raw).match(/BV1[0-9A-Za-z]{9}(?![0-9A-Za-z])/);
      return h('article', {style:{fontFamily:'system-ui,sans-serif',padding:'28px',color:'#243d4d',lineHeight:1.85}},
        h('h1', {style:{lineHeight:1.35}}, title),
        cover ? h('img', {src:String(props.getAsset(cover)),alt:'文章封面',style:{maxWidth:'100%',borderRadius:'12px'}}) : null,
        props.widgetFor('body'),
        bvid ? h('p', null, h('a', {href:'https://www.bilibili.com/video/'+bvid[0]+'/',target:'_blank',rel:'noopener noreferrer'}, 'B站视频：'+bvid[0]+'（发布后显示播放器）')) : null);
    });
  }
  CMS.registerEventListener({name:'preSave',handler:({entry})=>{
    const data=entry.get('data');
    const video=data.get('bilibili');
    if(video&&!/BV1[0-9A-Za-z]{9}(?![0-9A-Za-z])/.test(String(video)))throw new Error('B站链接中没有找到有效的 BV 号，请检查链接。');
    const now=new Date();
    const pad=n=>String(n).padStart(2,'0');
    const updated=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return data.set('updated',updated);
  }});
  CMS.init();
  loading.remove();
  // Decap owns a fixed toolbar after login; keep the welcome banner on login only.
  const syncHelp = () => {
    document.getElementById('editor-help').hidden = /^#\/(collections|workflow|media)/.test(location.hash);
  };
  window.addEventListener('hashchange', syncHelp);
  syncHelp();
  fetch('https://blog-auth.shiq.me/status').then(r=>r.json()).then(status=>{
    document.getElementById('auth-status').textContent=status.configured ? '' : '首次使用：请先打开专用开通链接。';
  }).catch(()=>{document.getElementById('auth-status').textContent='登录服务暂时连接不上，请稍后重试。';});
}());
