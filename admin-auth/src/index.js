import sealedbox from 'tweetnacl-sealedbox-js';
import { setupHTML, callbackHTML, errorHTML } from './pages.js';

const encoder = new TextEncoder();
const cookieName = '__Host-blog-cms-state';

/** @param {Uint8Array} bytes */
export function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
/** @param {string} text */
export function unbase64(text) { return Uint8Array.from(atob(text), c=>c.charCodeAt(0)); }
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; }

class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) { super(message); this.status=status; }
}

/** @param {Response | Request} input @param {number} limit */
async function readJSON(input, limit=131072) {
  const reader=input.body?.getReader();
  if(!reader) throw new HttpError(400,'缺少请求内容。');
  let total=0;
  const parts=[];
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new HttpError(413,'请求内容过大。');}parts.push(value);}
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try{return record(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw new HttpError(400,'请求格式不正确。');}
}

/** @param {string} input */
export async function digest(input) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(input)));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** @param {Env} env */
async function encryptionKey(env) {
  return crypto.subtle.importKey('raw',unbase64(env.CONFIG_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt']);
}

/** @param {{clientId:string,clientSecret:string}} data @param {Env} env */
export async function encryptConfig(data,env) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),encoder.encode(JSON.stringify(data)));
  return JSON.stringify({iv:base64(iv),cipher:base64(new Uint8Array(cipher))});
}

/** @param {Env} env */
async function getConfig(env) {
  const stored=await env.CMS_CONFIG.get('oauth-config');
  if(!stored)throw new HttpError(503,'登录服务还未开通，请先完成专用开通页的设置。');
  const encrypted=record(JSON.parse(stored));
  if(typeof encrypted.iv!=='string'||typeof encrypted.cipher!=='string')throw new Error('Invalid encrypted configuration');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(encrypted.iv)},await encryptionKey(env),unbase64(encrypted.cipher));
  const config=record(JSON.parse(new TextDecoder().decode(plain)));
  if(typeof config.clientId!=='string'||typeof config.clientSecret!=='string')throw new Error('Invalid OAuth configuration');
  return {clientId:config.clientId,clientSecret:config.clientSecret};
}

/** @param {string} token @param {string} endpoint @param {string} method @param {unknown} [body] */
async function github(token,endpoint,method='GET',body=undefined) {
  const response=await fetch('https://api.github.com'+endpoint,{
    method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Voyanissa-Blog-CMS','X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok){await response.body?.cancel();throw new HttpError(response.status===401?401:502,'GitHub 配置未完成，请确认当前账号拥有两个博客仓库的管理权限，再重新登录。');}
  if(response.status===204)return {};
  // All endpoints here return small, bounded metadata, never repository contents.
  return readJSON(response);
}

/** @param {string} token @param {Env} env */
export async function configureAutomation(token,env) {
  const configured=!!await env.CMS_CONFIG.get('automation-ready');
  const source=await github(token,'/repos/'+env.SOURCE_REPO);
  const published=await github(token,'/repos/'+env.PUBLISH_REPO);
  if(record(source.permissions).admin!==true||record(published.permissions).admin!==true)
    throw new HttpError(403,'首次开通需要由博客仓库的拥有者登录。');

  const keysResponse=await fetch('https://api.github.com/repos/'+env.PUBLISH_REPO+'/keys?per_page=100',{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Voyanissa-Blog-CMS'},signal:AbortSignal.timeout(15000),
  });
  if(!keysResponse.ok){await keysResponse.body?.cancel();throw new HttpError(502,'无法配置发布密钥，请重新登录。');}
  // GitHub limits this listing to 100 small public-key records.
  const keys=await keysResponse.json();
  const publicKey=env.BLOG_DEPLOY_PUBLIC_KEY.split(' ').slice(0,2).join(' ');
  const exists=Array.isArray(keys)&&keys.some(item=>record(item).key===publicKey&&record(item).read_only===false);
  if(configured&&exists)return;
  if(!exists)await github(token,'/repos/'+env.PUBLISH_REPO+'/keys','POST',{title:'Blog CMS automatic publisher',key:env.BLOG_DEPLOY_PUBLIC_KEY,read_only:false});

  const publicSecretKey=await github(token,'/repos/'+env.SOURCE_REPO+'/actions/secrets/public-key');
  if(typeof publicSecretKey.key!=='string'||typeof publicSecretKey.key_id!=='string')throw new Error('Missing repository public key');
  const encrypted=sealedbox.seal(encoder.encode(env.BLOG_DEPLOY_PRIVATE_KEY),unbase64(publicSecretKey.key));
  await github(token,'/repos/'+env.SOURCE_REPO+'/actions/secrets/BLOG_DEPLOY_KEY','PUT',{encrypted_value:base64(encrypted),key_id:publicSecretKey.key_id});

  // Direct Pages deployment avoids the GITHUB_TOKEN/deploy-key build-trigger gap.
  await github(token,'/repos/'+env.PUBLISH_REPO+'/pages','PUT',{build_type:'workflow'});
  await github(token,'/repos/'+env.PUBLISH_REPO+'/actions/workflows/pages.yml/dispatches','POST',{ref:'main'});
  await github(token,'/repos/'+env.SOURCE_REPO+'/actions/workflows/publish-blog.yml/dispatches','POST',{ref:'main'});
  await env.CMS_CONFIG.put('automation-ready',JSON.stringify({configuredAt:new Date().toISOString()}));
}

/** @param {Request} request @param {Env} env @param {string} nonce */
async function route(request,env,nonce) {
  const url=new URL(request.url);
  if(url.pathname==='/status'&&request.method==='GET')return Response.json({configured:!!await env.CMS_CONFIG.get('oauth-config'),automation:!!await env.CMS_CONFIG.get('automation-ready')});
  if(url.pathname==='/setup'&&request.method==='GET')return new Response(setupHTML(env,nonce),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/configure'&&request.method==='POST'){
    if(request.headers.get('Origin')!==env.AUTH_ORIGIN)throw new HttpError(403,'不允许的设置来源。');
    const supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
    const hashed=await digest(supplied);
    if(!/^[a-f0-9]{64}$/.test(env.BOOTSTRAP_HASH)||!crypto.subtle.timingSafeEqual(encoder.encode(hashed),encoder.encode(env.BOOTSTRAP_HASH)))throw new HttpError(403,'开通链接不正确。');
    if(await env.CMS_CONFIG.get('automation-ready'))throw new HttpError(409,'后台已经开通，请直接使用 GitHub 登录。');
    const data=await readJSON(request,4096);
    if(typeof data.clientId!=='string'||!/^[A-Za-z0-9._-]{10,100}$/.test(data.clientId)||typeof data.clientSecret!=='string'||!/^[A-Za-z0-9_-]{30,200}$/.test(data.clientSecret))throw new HttpError(400,'请检查 Client ID 和 Client secret 是否复制完整。');
    await env.CMS_CONFIG.put('oauth-config',await encryptConfig({clientId:data.clientId,clientSecret:data.clientSecret},env));
    return Response.json({configured:true});
  }
  if(url.pathname==='/auth'&&request.method==='GET'){
    if(url.searchParams.get('provider')!=='github')throw new HttpError(400,'只支持 GitHub 登录。');
    const config=await getConfig(env),state=base64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,'');
    const authorize=new URL('https://github.com/login/oauth/authorize');
    authorize.search=new URLSearchParams({client_id:config.clientId,redirect_uri:env.AUTH_ORIGIN+'/callback',scope:'repo',state,allow_signup:'false'}).toString();
    return new Response(null,{status:302,headers:{Location:authorize.href,'Set-Cookie':`${cookieName}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
  }
  if(url.pathname==='/callback'&&request.method==='GET'){
    const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
    const stored=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
    if(!state||state.length<32||state.length>64||state.length!==stored.length||!crypto.subtle.timingSafeEqual(encoder.encode(state),encoder.encode(stored)))throw new HttpError(400,'登录请求已过期，请返回后台重新登录。');
    if(!code||code.length>256)throw new HttpError(400,'GitHub 未完成授权。');
    const config=await getConfig(env);
    const response=await fetch('https://github.com/login/oauth/access_token',{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'Voyanissa-Blog-CMS'},
      body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,code,redirect_uri:env.AUTH_ORIGIN+'/callback'}),signal:AbortSignal.timeout(15000),
    });
    const auth=await readJSON(response,16384);
    if(!response.ok||typeof auth.access_token!=='string')throw new HttpError(401,'GitHub 授权失败，请检查登录应用的设置。');
    const user=await github(auth.access_token,'/user');
    if(typeof user.login!=='string'||user.login.toLowerCase()!==env.ALLOWED_USER.toLowerCase())throw new HttpError(403,'这个账号没有博客编辑权限。');
    const repository=await github(auth.access_token,'/repos/'+env.SOURCE_REPO);
    if(record(repository.permissions).push!==true)throw new HttpError(403,'这个账号没有博客仓库写入权限。');
    await configureAutomation(auth.access_token,env);
    return new Response(callbackHTML(auth.access_token,env.ADMIN_ORIGIN,nonce),{headers:{'Content-Type':'text/html; charset=utf-8','Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
  }
  throw new HttpError(404,'未找到这个页面。');
}

/** @type {ExportedHandler<Env>} */
export default {
  async fetch(request,env) {
    const nonce=crypto.randomUUID().replaceAll('-','');
    let response;
    try{response=await route(request,env,nonce);}catch(error){
      const status=error instanceof HttpError?error.status:500;
      const message=error instanceof HttpError?error.message:'登录服务暂时无法连接，请稍后再试。';
      console.log(JSON.stringify({event:'cms-auth-error',status}));
      response=new URL(request.url).pathname==='/configure'?Response.json({error:message},{status})
        :new Response(errorHTML(message,nonce),{status,headers:{'Content-Type':'text/html; charset=utf-8'}});
    }
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','no-store');
    headers.set('Referrer-Policy','no-referrer');
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    const origin=request.headers.get('Origin');
    if(origin===env.ADMIN_ORIGIN||origin===env.AUTH_ORIGIN){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');}
    return new Response(response.body,{status:response.status,headers});
  },
};
