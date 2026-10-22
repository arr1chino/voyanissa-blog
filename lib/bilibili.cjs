'use strict';
function extractBvid(input) {
  if (typeof input !== 'string') return null;
  return input.match(/BV1[0-9A-Za-z]{9}(?![0-9A-Za-z])/)?.[0] || null;
}
function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function videoHTML(bvid, title) {
  if (extractBvid(bvid) !== bvid) throw new Error('Invalid Bilibili video ID');
  return `<div style="position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:#080c12;">
<iframe src="https://player.bilibili.com/player.html?isOutside=true&amp;bvid=${bvid}&amp;p=1&amp;autoplay=0&amp;danmaku=0" title="${escapeHTML(title || 'B站视频')}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;"></iframe>
</div>
<p><a href="https://www.bilibili.com/video/${bvid}/" target="_blank" rel="noopener noreferrer">在哔哩哔哩观看完整版</a></p>`;
}
function appendVideo(data) {
  if (!data.bilibili) return data;
  const id=extractBvid(data.bilibili);
  if(!id)throw new Error('B站视频链接无效：'+(data.source||data.title||'文章'));
  const marker='<!-- blog-bilibili:'+id+' -->';
  if(data.content.includes(marker))return data;
  const more=/<!--\s*more\s*-->/i.test(data.content)?'':'\n\n<!-- more -->';
  data.content+=more+'\n\n'+marker+'\n\n'+videoHTML(id,data.title)+'\n';
  return data;
}
module.exports={extractBvid,videoHTML,appendVideo};
