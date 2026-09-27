---
title: 和沃聊天
date: 2026-09-27 09:00:00
layout: page
aside: false
comments: false
top_img: false
---

<!-- 聊天窗整块画在下面这个占位里，画的人是 /js/hb-chat.js -->
<div id="hb-chat" class="hbc-page"></div>
<!-- 中转站在 Cloudflare 上，地址拿到之后填进下面这对引号里，再重新构建一次就行。
     本地预览（地址是 localhost）时会自动指到本机的试玩服务器，不用改这里。 -->
<script>window.HB_CHAT_API = "https://voyanissa-ai.3558069054.workers.dev";</script>
<script src="/js/hb-chat.js" defer></script>
