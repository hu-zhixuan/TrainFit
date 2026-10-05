/**
 * 美术资源（v7.1，用户：「走 galgame 级别的美术成本 + 乙游级别的陪伴体验」「注意架构」；v7.2 用上わたおきば的立绘，用户挑的：江叙 = 男性15、夏柚 = 女性20）。
 *
 * 两层美术分开：今天页上趴着的是像素小人（buddy.js，Q 版、会动、跟着记录换装）；剧场（theater.js）里演剧情时用立绘、CG、背景图。
 * 图都不进仓库（免费素材不准转发原图，仓库是公开的）：`python3 scripts/build-art.py --fetch` 按 art/sources.json 下载、
 * 压成 web/img/cast/ 里的 webp，生成清单 web/img/cast/manifest.js（CI 打包时跑，图只进 APK）。
 * 剧场按清单取图；没有清单、或清单里没有的，就退回以前的做法——像素小人放大、CSS 画的背景、像素道具拼的 CG。图加载失败也退回（fail）。
 *
 * 清单里的路径：
 *   img/cast/jx/face-calm.webp …           立绘，一个表情一张（同一个姿势、同一个构图，只换脸），表情名见 FACES
 *   img/cast/jx/cg/jx-pool6.webp …         CG，名字和 cast_main.js 里的 cgs 对上
 *   img/cast/bg/pool.webp …                背景，名字和剧场的 data-bg 对上（room / pool / gym / studio / stage …）
 *   credits                                署名（立绘是谁画的），结局字幕和设置「剧情」底下写出来
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 剧本里的表情名 → 立绘文件名（英文好管理）
  const FACES = { 平静: 'calm', 开心: 'happy', 害羞: 'shy', 担心: 'worried', 得意: 'smug', 惊讶: 'surprised', 不服: 'pout', 心动: 'love', 困: 'sleepy', 闪亮: 'sparkle', 撑: 'full' };
  // 没有这个表情的立绘时，先找相近的（心动 → 害羞 → 开心 → 平静）
  const FALLBACK = { 心动: ['害羞', '开心'], 闪亮: ['得意', '开心'], 得意: ['开心'], 撑: ['开心'], 困: ['平静'], 不服: ['担心'], 惊讶: ['平静'], 害羞: ['开心'] };
  const BGS = ['room', 'roomnight', 'gym', 'pool', 'studio', 'cafe', 'street', 'citynight', 'rain', 'night', 'dusk', 'dawn', 'stage'];

  const broken = new Set(); // 加载失败的图（清单在、图没打进包时），以后不再用

  function manifest() { return TF.ArtManifest || { cast: {}, bg: {} }; }

  /** 这个人这个表情的立绘（没有返回 ''） */
  function sprite(char, face) {
    const m = (manifest().cast || {})[char];
    if (!m || !m.face) return '';
    const tries = [face].concat(FALLBACK[face] || [], ['平静']);
    for (const f of tries) { const k = FACES[f]; const url = k && m.face[k]; if (url && !broken.has(url)) return url; }
    return '';
  }

  /** 图加载失败：记下来，剧场重画时退回像素小人 */
  function fail(url) { if (url) broken.add(url); }

  /** 署名：[{ who: 'jx', what: '立绘', credit: 'わたおきば（わたおび）', url }]，char 给了就只要这个人的 */
  function credits(char) {
    return (manifest().credits || []).filter(c => !char || c.who === char);
  }

  /** 这张 CG 的图（没有返回 ''，剧场就用像素小人 + 道具拼） */
  function cg(char, id) {
    const m = (manifest().cast || {})[char];
    return (m && m.cg && m.cg[id]) || '';
  }

  /** 背景图（没有返回 ''，用 CSS 画的） */
  function bg(id) { return (manifest().bg || {})[id] || ''; }

  /** 有多少张了（设置里能看到美术补到哪了） */
  function count(char) {
    const m = (manifest().cast || {})[char] || {};
    return { face: Object.keys(m.face || {}).length, cg: Object.keys(m.cg || {}).length, bg: Object.keys(manifest().bg || {}).length };
  }

  TF.Art = { FACES, FALLBACK, BGS, sprite, fail, credits, cg, bg, count };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Art;
})(typeof window !== 'undefined' ? window : globalThis);
