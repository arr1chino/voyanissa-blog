---
title: 和沃聊天
date: 2026-09-27 09:00:00
layout: page
aside: false
comments: false
top_img: false
description: 和沃雅妮莎聊两句 —— 她本人（大概）在线。
---

<!-- 聊天窗整块画在下面这个占位里，画的人是 /js/hb-chat.js -->
<div id="hb-chat" class="hbc-page"></div>
<!-- 中转站在 Cloudflare 上。地址填进下面这对引号里，改完重新构建一次就生效。
     （上面 description 那一行是给搜索引擎用的：不写的话 Hexo 会拿这串地址当简介。）
     2026-09-28 r132：原来是 xxx.workers.dev 那个免费域名，它在国内被墙（DNS 污染 +
     IP 层封锁），聊天窗一直连不上。现在换成绑在自己域名上的 api.shiq.me，走普通 443。 -->
<script>window.HB_CHAT_API = "https://api.shiq.me";</script>
<script src="/js/hb-chat.js" defer></script>
