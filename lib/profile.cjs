'use strict';

const SCENES = ['model', 'current', 'hobbies', 'website', 'blog'];

function text(value, label, required = true) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new Error('网站设置：请填写' + label);
  }
  return value;
}

function publicUrl(value, label, local = false) {
  const url = text(value, label).trim();
  if (local && /^\/(?!\/)/.test(url) && !/[\\\r\n]/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) return parsed.href;
  } catch {}
  throw new Error('网站设置：' + label + '需要完整的 http/https 链接' + (local ? '或以 / 开头的站内路径' : ''));
}

function readSettings(data) {
  const profile = data.profile || {};
  const homepage = data.homepage || {};
  for (const key of ['author', 'site_title', 'footer_brand']) text(profile[key], key);
  for (const key of ['tagline', 'site_description', 'footer_description']) text(profile[key], key, false);
  const avatar = publicUrl(profile.avatar, '头像', true);
  if (profile.contacts != null && !Array.isArray(profile.contacts)) throw new Error('网站设置：联系方式需要是列表');
  const contacts = (profile.contacts || []).map(contact => {
    text(contact.name, '平台名称');
    const url = contact.url ? publicUrl(contact.url, contact.name + '链接') : '';
    const copy = contact.copy == null ? '' : String(contact.copy);
    if (!url && !copy.trim()) throw new Error('网站设置：' + contact.name + '需要填写主页链接或复制内容');
    return {...contact, handle: contact.handle == null ? '' : String(contact.handle), url, copy};
  });
  const intro = homepage.intro || {};
  for (const key of ['lead', 'title', 'kicker', 'welcome']) text(intro[key], '开场' + key);
  if (!Array.isArray(intro.words) || !intro.words.length) throw new Error('网站设置：至少保留一个循环兴趣词');
  intro.words.forEach(word => text(word, '兴趣词'));
  for (const key of SCENES) {
    const scene = homepage[key] || {};
    text(scene.title, '首页介绍标题');
    text(scene.kicker, '首页介绍小标题');
    text(scene.body, '首页介绍正文', false);
    if (scene.tags != null && !Array.isArray(scene.tags)) throw new Error('网站设置：兴趣标签需要是列表');
  }
  return {profile: {...profile, avatar, contacts}, homepage};
}

function applyProfile(config, theme, profile) {
  // Overlay only presentation fields; deployment, login and rendering settings stay in their own config.
  config.author = profile.author;
  config.subtitle = profile.tagline || '';
  config.title = profile.site_title;
  config.description = profile.site_description || '';
  theme.avatar = {...theme.avatar, img: profile.avatar};
  if (theme.aside?.card_author) theme.aside.card_author.description = profile.tagline || '';
}

module.exports = {SCENES, readSettings, applyProfile};
