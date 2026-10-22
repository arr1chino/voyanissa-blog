'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractBvid,appendVideo}=require('../lib/bilibili.cjs');
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
