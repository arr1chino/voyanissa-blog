'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractBvid,appendVideo}=require('../lib/bilibili.cjs');
const {readSettings}=require('../lib/profile.cjs');
const fs=require('node:fs');
const path=require('node:path');
const yaml=require('js-yaml');
const project=path.resolve(__dirname,'..');
const settings=()=>Object.fromEntries(['profile','homepage'].map(name=>[name,yaml.load(fs.readFileSync(path.join(project,'source/_data',name+'.yml'),'utf8'))]));
test('shared Bilibili text produces one safe player and preserves the article',()=>{
  const data={title:'标题 <script>alert(1)</script>',bilibili:'【作品】 https://www.bilibili.com/video/BV1ejnq6UE7p/?share_source=copy_web',content:'正文\n\n<!-- more -->\n\n原来的段落'};
  appendVideo(data);appendVideo(data);
  assert.equal((data.content.match(/<iframe/g)||[]).length,1);
  assert.ok(data.content.startsWith('正文\n\n<!-- more -->\n\n原来的段落'));
  assert.ok(data.content.includes('autoplay=0'));
  assert.ok(!data.content.includes('<script>'));
  assert.ok(data.content.includes('&lt;script&gt;'));
});
test('invalid IDs never become embeds, and normal articles remain untouched',()=>{
  assert.equal(extractBvid('https://example.org/no-video'),null);
  assert.equal(extractBvid('BV1ejnq6UE7pTOOLONG'),null);
  assert.throws(()=>appendVideo({bilibili:'https://example.org/',content:'保留正文'}));
  const plain={content:'旧文章'};
  assert.equal(appendVideo(plain),plain);
  assert.equal(plain.content,'旧文章');
});

test('profile settings reject unusable links and empty typewriter words',()=>{
  const data=settings();
  data.profile.contacts=[{name:'微信',handle:123,copy:123}];
  assert.equal(readSettings(data).profile.contacts[0].copy,'123');
  data.profile.contacts[0].url='javascript:alert(1)';
  assert.throws(()=>readSettings(data),/http\/https/);
  data.profile.contacts=[];
  data.homepage.intro.words=[];
  assert.throws(()=>readSettings(data),/兴趣词/);
});

test('editing settings reaches real homepage, article metadata and contacts without changing scene count',async()=>{
  const Hexo=require('hexo');
  const {JSDOM}=require('node:module').createRequire(require.resolve('hexo-renderer-marked'))('jsdom');
  const hexo=new Hexo(project,{silent:true});
  // Never depend on a developer's incremental build cache.
  hexo.database.options.path=path.join(project,'node_modules/.profile-test-unused-db.json');
  await hexo.init();
  const changed=settings();
  Object.assign(changed.profile,{
    author:'资料测试作者',tagline:'第一行简介\n第二行简介',avatar:'/img/profile-test.webp',
    site_title:'资料测试网站',site_description:'资料测试摘要',footer_brand:'TEST BRAND',
    footer_description:'测试页脚介绍',contacts:[{platform:'wechat',name:'微信测试',copy:'profile-test-id'}]
  });
  changed.homepage.intro.title='你好 <script>alert(1)</script>';
  changed.homepage.intro.words=['新兴趣','摄影 & 影像'];
  changed.homepage.current.title='我正在做的测试';
  changed.homepage.current.body='介绍第一行\n介绍第二行';
  changed.homepage.current.tags=['测试标签'];
  // Override only this process's cached template data. No source or database edits.
  hexo.extend.filter.register('before_generate',()=>Object.assign(hexo.locals.get('data'),changed),0);
  await hexo.load();
  const read=async name=>{
    let out='';for await(const chunk of hexo.route.get(name))out+=chunk;
    const doc=new JSDOM(out).window.document;
    return selector=>{
      const nodes=[...doc.querySelectorAll(selector)];
      return {text:()=>nodes.map(node=>node.textContent).join(''),attr:name=>nodes[0]?.getAttribute(name),length:nodes.length};
    };
  };
  const home=await read('index.html');
  assert.equal(home('.hb-name').text(),'资料测试作者');
  assert.equal(home('.hb-tagline').text(),'第一行简介\n第二行简介');
  assert.equal(home('.hb-avatar img').attr('src'),'/img/profile-test.webp');
  assert.ok(home('title').text().includes('资料测试网站'));
  assert.equal(home('meta[name="description"]').attr('content'),'资料测试摘要');
  assert.equal(home('.hero-panel').length,6);
  assert.equal(home('.hero-about-name').text(),changed.homepage.intro.title);
  assert.equal(home('.hero-about-name script').length,0);
  assert.deepEqual(JSON.parse(home('#hero-about-word').attr('data-words')),changed.homepage.intro.words);
  assert.equal(home('.hero-panel[data-index="2"] h2').text(),'我正在做的测试');
  assert.equal(home('.hero-panel[data-index="2"] p').text(),changed.homepage.current.body);
  assert.equal(home('.hero-panel[data-index="2"] .hero-tags').text(),'测试标签');
  assert.equal(home('.kelo-logo').text(),'TEST BRAND');
  assert.equal(home('.kelo-desc').text(),'测试页脚介绍');
  assert.equal(home('.kelo-social-item').length,1);
  assert.equal(home('.kelo-social-item').attr('data-hb-copy'),'profile-test-id');
  const article=hexo.model('Post').findOne({slug:'the-sound-of-farewell'});
  assert.ok(article,'The existing video article must be loaded');
  const post=await read(article.path);
  assert.ok(post('title').text().includes('资料测试网站'));
  assert.equal(post('meta[name="author"]').attr('content'),'资料测试作者');
  assert.ok(post('.post-copyright').text().includes('资料测试作者'));
});
