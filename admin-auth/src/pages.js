/** @param {string} value */
export function escapeHTML(value) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char));
}

/** @param {string} title @param {string} content @param {string} nonce */
function documentHTML(title, content, nonce) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style nonce="${nonce}">body{margin:0;background:#edf5f8;color:#1c3446;font:16px/1.8 system-ui,sans-serif}main{max-width:680px;margin:7vh auto;padding:32px;background:white;border-radius:20px}h1{font-size:27px;line-height:1.35}a{color:#15658c}label{display:block;margin:18px 0}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #8da8b8;border-radius:8px;font:inherit}button{padding:12px 22px;background:#15658c;border:0;border-radius:8px;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.6}#message{white-space:pre-wrap}small{color:#536b7b}code{overflow-wrap:anywhere}@media(max-width:720px){main{margin:16px;padding:22px}}</style></head><body><main>${content}</main></body></html>`;
}

/** @param {Env} env @param {string} nonce */
export function setupHTML(env, nonce) {
  const github = new URL('https://github.com/settings/applications/new');
  github.search = new URLSearchParams({'oauth_application[name]':'沃雅妮莎博客写作后台','oauth_application[url]':env.ADMIN_ORIGIN+'/admin/','oauth_application[callback_url]':env.AUTH_ORIGIN+'/callback'}).toString();
  return documentHTML('开通博客写作后台', `<h1>开通博客写作后台</h1><p>只需完成这一次设置，之后就能用 GitHub 登录写文章。</p><ol><li><a href="${escapeHTML(github.href)}" target="_blank" rel="noopener noreferrer">打开 GitHub 注册页面</a>，名称和网址已填好，点击 <strong>Register application</strong>。</li><li>复制页面中的 <strong>Client ID</strong>，再点 <strong>Generate a new client secret</strong>，把两项填在下面。</li></ol><p><small>如果注册页有“Expire user access tokens”选项，先取消勾选。密钥只会加密保存到你的登录服务，不会写进博客或代码仓库。</small></p><form id="setup"><label>Client ID<input id="client-id" required autocomplete="off" spellcheck="false"></label><label>Client secret<input id="client-secret" type="password" required autocomplete="off"></label><button id="save">保存并继续</button></form><p id="message" role="status"></p><p><a href="${escapeHTML(env.ADMIN_ORIGIN)}/admin/">返回写作后台</a></p><script nonce="${nonce}">
const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
const form=document.getElementById('setup'),message=document.getElementById('message'),button=document.getElementById('save');
if(!token){message.textContent='请使用本次提供给你的专用开通链接。';button.disabled=true;}
form.addEventListener('submit',async(event)=>{event.preventDefault();button.disabled=true;message.textContent='正在保存…';try{const response=await fetch('/configure',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({clientId:document.getElementById('client-id').value.trim(),clientSecret:document.getElementById('client-secret').value.trim()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败，请重试');document.getElementById('client-secret').value='';message.textContent='设置已保存。返回写作后台，点击“使用 GitHub 登录”，首次登录会自动接通发布。';}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});
</script>`, nonce);
}

/** @param {string} token @param {string} origin @param {string} nonce */
export function callbackHTML(token, origin, nonce) {
  const payload = JSON.stringify('authorization:github:success:'+JSON.stringify({token,provider:'github'})).replace(/</g,'\\u003c');
  return documentHTML('GitHub 登录成功', `<h1>登录成功</h1><p>正在返回写作后台，可以关闭这个窗口。</p><script nonce="${nonce}">const origin=${JSON.stringify(origin)},payload=${payload};window.addEventListener('message',event=>{if(event.origin===origin&&event.source===window.opener&&event.data==='authorizing:github'){window.opener.postMessage(payload,origin);window.close();}});if(window.opener)window.opener.postMessage('authorizing:github',origin);</script>`, nonce);
}

/** @param {string} message @param {string} nonce */
export function errorHTML(message, nonce) {
  return documentHTML('暂时无法登录',`<h1>暂时无法登录</h1><p>${escapeHTML(message)}</p><p>请关闭这个窗口，返回后台重新登录。</p>`,nonce);
}
