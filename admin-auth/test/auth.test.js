import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {timingSafeEqual} from 'node:crypto';
import nacl from 'tweetnacl';
import sealedbox from 'tweetnacl-sealedbox-js';
import worker,{digest,encryptConfig,base64,unbase64} from '../src/index.js';
// Cloudflare exposes this extension; Node's Web Crypto does not.
Object.defineProperty(crypto.subtle,'timingSafeEqual',{value:timingSafeEqual,configurable:true});
const nativeFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=nativeFetch;});
async function fixture(){
  const data=new Map();
  return {data,env:{CMS_CONFIG:{get:async key=>data.get(key)||null,put:async(key,value)=>{data.set(key,value);}},ADMIN_ORIGIN:'https://arr1chino.github.io',AUTH_ORIGIN:'https://blog-auth.shiq.me',ALLOWED_USER:'arr1chino',SOURCE_REPO:'arr1chino/voyanissa-blog',PUBLISH_REPO:'arr1chino/arr1chino.github.io',CONFIG_ENCRYPTION_KEY:base64(crypto.getRandomValues(new Uint8Array(32))),BOOTSTRAP_HASH:await digest('private-once-token'),BLOG_DEPLOY_PRIVATE_KEY:'TEST-DEPLOY-KEY',BLOG_DEPLOY_PUBLIC_KEY:'ssh-rsa TESTPUBLIC'}};
}
const call=(env,path,options={})=>worker.fetch(new Request('https://blog-auth.shiq.me'+path,options),env,{});
test('setup requires the private token and same origin; configuration is encrypted',async()=>{
 const {env,data}=await fixture();
 const config={clientId:'valid-client-123',clientSecret:'s'.repeat(40)};
 const setup={method:'POST',headers:{Origin:env.AUTH_ORIGIN,Authorization:'Bearer private-once-token'},body:JSON.stringify(config)};
 assert.equal((await call(env,'/configure',{...setup,headers:{...setup.headers,Origin:'https://evil.example'}})).status,403);
 assert.equal((await call(env,'/configure',{...setup,headers:{...setup.headers,Authorization:'Bearer wrong'}})).status,403);
 assert.equal(data.size,0);
 assert.equal((await call(env,'/configure',setup)).status,200);
 assert.ok(!data.get('oauth-config').includes(config.clientSecret));
 assert.ok(!data.get('oauth-config').includes(config.clientId));
 data.set('automation-ready','true');
 assert.equal((await call(env,'/configure',setup)).status,409);
});
test('CSRF and unrelated accounts cannot obtain a CMS token',async()=>{
 const {env,data}=await fixture();
 data.set('oauth-config',await encryptConfig({clientId:'client-12345',clientSecret:'secret-value'},env));
 const auth=await call(env,'/auth?provider=github');
 assert.equal(auth.status,302);
 const state=new URL(auth.headers.get('Location')).searchParams.get('state');
 const cookie=auth.headers.get('Set-Cookie').split(';')[0];
 assert.ok(cookie.includes('__Host-'));
 assert.equal((await call(env,'/callback?state=bad&code=code',{headers:{Cookie:cookie}})).status,400);
 let calls=0;
 globalThis.fetch=async url=>{calls++;return Response.json(String(url).includes('/access_token')?{access_token:'should-never-reach-opener'}:{login:'some-other-user'});};
 const response=await call(env,'/callback?state='+state+'&code=test-code',{headers:{Cookie:cookie}});
 assert.equal(response.status,403);
 assert.ok(!(await response.text()).includes('should-never-reach-opener'));
 assert.equal(calls,2);
 assert.ok(!data.has('automation-ready'));
});
test('owner login configures both repositories and sends token only to the exact opener origin',async()=>{
 const {env,data}=await fixture();
 data.set('oauth-config',await encryptConfig({clientId:'client-12345',clientSecret:'private-client-secret'},env));
 const keys=nacl.box.keyPair();
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
   const endpoint=new URL(url).pathname;
   const body=options.body?JSON.parse(options.body):null;
   calls.push({endpoint,method:options.method||'GET',body});
   if(endpoint==='/login/oauth/access_token')return Response.json({access_token:'owner-access-token'});
   if(endpoint==='/user')return Response.json({login:'arr1chino'});
   if(endpoint.endsWith('/actions/secrets/public-key'))return Response.json({key:base64(keys.publicKey),key_id:'key-id'});
   if(endpoint.endsWith('/actions/secrets/BLOG_DEPLOY_KEY')){
     assert.equal(new TextDecoder().decode(sealedbox.open(unbase64(body.encrypted_value),keys.publicKey,keys.secretKey)),env.BLOG_DEPLOY_PRIVATE_KEY);
     return new Response(null,{status:204});
   }
   if(endpoint.endsWith('/keys'))return options.method==='POST'?Response.json({id:1},{status:201}):Response.json([]);
   if(endpoint.endsWith('/dispatches'))return new Response(null,{status:204});
   return Response.json({permissions:{admin:true,push:true}});
 };
 const auth=await call(env,'/auth?provider=github');
 const state=new URL(auth.headers.get('Location')).searchParams.get('state');
 const response=await call(env,'/callback?state='+state+'&code=test-code',{headers:{Cookie:auth.headers.get('Set-Cookie').split(';')[0]}});
 assert.equal(response.status,200);
 const html=await response.text();
 assert.ok(html.includes('owner-access-token'));
 assert.ok(html.includes('event.source===window.opener'));
 assert.ok(html.includes('event.origin===origin'));
 assert.ok(!html.includes("postMessage(payload,'*')"));
 assert.ok(!html.includes('private-client-secret'));
 assert.ok(data.has('automation-ready'));
 assert.ok(calls.some(call=>call.endpoint.endsWith('/pages')&&call.method==='PUT'&&call.body.build_type==='workflow'));
 assert.equal(calls.filter(call=>call.endpoint.endsWith('/dispatches')).length,2);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('oversized and malformed configuration is rejected without writes',async()=>{
 const {env,data}=await fixture();
 const options={method:'POST',headers:{Origin:env.AUTH_ORIGIN,Authorization:'Bearer private-once-token'}};
 assert.equal((await call(env,'/configure',{...options,body:'x'.repeat(5000)})).status,413);
 assert.equal((await call(env,'/configure',{...options,body:'{bad'})).status,400);
 assert.equal(data.size,0);
});
