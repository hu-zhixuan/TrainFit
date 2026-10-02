/**
 * 像素小人（照着用户本人画的男生：黑色蓬松乱发、刘海压眼、黑色棒球服白袖子；女生：长直发、齐刘海、眼角一点眼线）。
 * 学 Claude Code 里趴在输入框上的小家伙：平时趴在底部输入栏上沿；弹出「记好了」提示条、录音面板、修改 / 分享面板时，
 * 跳到最上面那一层的上沿趴着。别的界面一点不动。
 *
 * 表情跟今天的健康度走：没记 → 发呆（夜里闭眼打 Z），不健康 → 冒汗，还行 → 平常，健康 → 哼歌，非常健康 → 戴墨镜。
 * 小动作：头发隔一会儿晃一下、眨眼、偶尔左右看一眼；隔半分钟左右自己站起来伸个懒腰、溜达两步；
 * 点一下站起来招手；按住说话时站起来听；记上一顿举手欢呼；Z 往上飘、音符一跳一跳。
 * 第一次用时由它带着看三步新手教程（tf_tour），设置里能再看一遍。
 * 连续记录的天数换装备：3 天头带，7 天棒球帽，30 天皇冠。点一下弹个气泡：连续几天、今天怎么样、蛋白还差多少。
 * 设置 →「外观」里换角色（男生 / 女生，默认跟着性别）、发色、衣服，也能关掉。存在 profile.buddy 里，跟着备份走。
 *
 * 画法：趴着 24×17、站着 24×25 的像素图，叠上眼睛、装备，自动描一圈深色边（浅色背景上也看得清）；特效单独一层（好让它动）。
 * 输出 SVG，每种颜色一条 path，shape-rendering=crispEdges；动画全在 CSS 里。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // '.' 透明，','（只在装备里用）擦掉原来的像素。
  // H 头发 h 头发暗部 L 头发高光；S 皮肤 s 皮肤暗部（刘海的影子）E 眼睛 / 眼线；J 外套；W 袖子 w 袖子暗部；
  // K 墨镜 k 墨镜反光；G 绿 g 深绿；A 金 a 金高光；B 汗 Z 睡觉 N 音符 X 闪光；O 描边
  const CHARS = {
    boy: {
      label: '男生',
      body: [
        '..........H.HH..H.......',
        '........HHHHHHHHH.......',
        '......HHHLLHHHHHHHH.....',
        '.....HHHLHHHHHHHHHHH....',
        '.....HHHHHHHHHHHHHLHH...',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHHhHHHhHHHHhHHHH..',
        '....HHHhSHhSSShSHhHHHH..',
        '.....HHssssssssssHHH....',
        '.....HHSEESSSSEESHH.....',
        '......HSSSSSSSSSSH......',
        '..JJ..HsSSSSSSSSsH..JJ..',
        '.JJJJJJwwwwwwwwwwJJJJJJ.',
        'WWWWWWWWWWWWWWWWWWWWWWWW',
        'wWWWWWWWWWWWWWWWWWWWWWWw',
        'wwwwwwwwwwwwwwwwwwwwwwww'
      ],
      tufts: ['..........H.HH..H.......', '...........H.HH..H......'],
      // 站起来：头（和趴着一样，最后一行是下巴）+ 身子 + 腿；招手两帧、伸懒腰、走路两帧
      stand: {
        head: [
          '..........H.HH..H.......',
          '........HHHHHHHHH.......',
          '......HHHLLHHHHHHHH.....',
          '.....HHHLHHHHHHHHHHH....',
          '.....HHHHHHHHHHHHHLHH...',
          '....HHHHHHHHHHHHHHHHH...',
          '....HHHHHHHHHHHHHHHHHH..',
          '....HHHHhHHHhHHHHhHHHH..',
          '....HHHhSHhSSShSHhHHHH..',
          '.....HHssssssssssHHH....',
          '.....HHSEESSSSEESHH.....',
          '......HSSSSSSSSSSH......',
          '.......sSSSSSSSSs.......'
        ],
        body: [
          '.........jWjjWj.........',
          '.......WWJjWWjJWW.......',
          '......WWWJJJJJJWWW......',
          '......WWwJWWJJJJwWW.....',
          '......WWwJWWJJJJwWW.....',
          '......WWwJJJJJJJwWW.....',
          '......SS.JJJJJJJ.SS.....',
          '.........PPPPPPP........'
        ],
        wave: [
          '.........jWjjWj.....SS..',
          '.......WWJjWWjJWW..WW...',
          '......WWWJJJJJJWWWWW....',
          '......WWwJWWJJJJJWW.....',
          '......WWwJWWJJJJJ.......',
          '......WWwJJJJJJJJ.......',
          '......SS.JJJJJJJJ.......',
          '.........PPPPPPP........'
        ],
        wave2: [
          '.........jWjjWj......SS.',
          '.......WWJjWWjJWW...WW..',
          '......WWWJJJJJJWWWWWW...',
          '......WWwJWWJJJJJWW.....',
          '......WWwJWWJJJJJ.......',
          '......WWwJJJJJJJJ.......',
          '......SS.JJJJJJJJ.......',
          '.........PPPPPPP........'
        ],
        stretch: [
          '.........jWjjWj.........',
          '........JJjWWjJJ........',
          '........JJJJJJJJ........',
          '........JWWJJJJJ........',
          '........JWWJJJJJ........',
          '........JJJJJJJJ........',
          '........JJJJJJJJ........',
          '.........PPPPPPP........'
        ],
        legs: [
          '.........PPP.PPP........',
          '.........PPP.PPP........',
          '.........PPP.PPP........',
          '........WWWW.WWWW.......'
        ],
        walk: [
          '........PPP...PPP.......',
          '.......PPP.....PPP......',
          '.......PPP.....PPP......',
          '......WWWW.....WWWW.....'
        ]
      },
      eyeX: 7,
      eyes: { chill: 'SEESSSSEES', closed: 'SssSSSSssS', left: 'EESSSSEESS', right: 'SSEESSSSEE' }
    },
    girl: {
      label: '女生',
      body: [
        '...........HH...........',
        '........HHHHHHHHH.......',
        '......HHHLLHHHHHHHH.....',
        '.....HHHLHHHHHHHHHHH....',
        '.....HHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHhHHHHhHHHHhHHHH..',
        '....HHhssssssssssHHHH...',
        '....HHESEESSSSEESEHHH...',
        '....HHSSSSSSSSSSSSHHH...',
        '..JJHHHsSSSSSSSSsHHHJJ..',
        '.JJJHHHwwwwwwwwwwHHHJJJ.',
        'WWWHHHWWWWWWWWWWWHHHWWWW',
        'wWWWHHWWWWWWWWWWWHHWWWWw',
        'wwwwwwwwwwwwwwwwwwwwwwww'
      ],
      // 头顶一根呆毛，两帧来回晃
      tufts: ['...........HH...........', '............HH..........'],
      stand: {
        head: [
          '...........HH...........',
          '........HHHHHHHHH.......',
          '......HHHLLHHHHHHHH.....',
          '.....HHHLHHHHHHHHHHH....',
          '.....HHHHHHHHHHHHHHHH...',
          '....HHHHHHHHHHHHHHHHH...',
          '....HHHHHHHHHHHHHHHHHH..',
          '....HHHHHHHHHHHHHHHHHH..',
          '....HHHhHHHHhHHHHhHHHH..',
          '....HHhssssssssssHHHH...',
          '....HHESEESSSSEESEHHH...',
          '....HHSSSSSSSSSSSSHHH...',
          '....HHHsSSSSSSSSsHHHH...'
        ],
        body: [
          '....HHH..jWjjWj..HHH....',
          '....HHWWJjWWjJWWHHH.....',
          '.....HWWJJJJJJWWWH......',
          '......WWwJWWJJJJwWW.....',
          '......WWwJWWJJJJwWW.....',
          '......WWwJJJJJJJwWW.....',
          '......SS.JJJJJJJ.SS.....',
          '........PPPPPPPPP.......'
        ],
        wave: [
          '....HHH..jWjjWj....SS...',
          '....HHWWJjWWjJWW..WW....',
          '.....HWWJJJJJJWWWWW.....',
          '......WWwJWWJJJJJWW.....',
          '......WWwJWWJJJJJ.......',
          '......WWwJJJJJJJJ.......',
          '......SS.JJJJJJJJ.......',
          '........PPPPPPPPP.......'
        ],
        wave2: [
          '....HHH..jWjjWj.....SS..',
          '....HHWWJjWWjJWW...WW...',
          '.....HWWJJJJJJWWWWWW....',
          '......WWwJWWJJJJJWW.....',
          '......WWwJWWJJJJJ.......',
          '......WWwJJJJJJJJ.......',
          '......SS.JJJJJJJJ.......',
          '........PPPPPPPPP.......'
        ],
        stretch: [
          '....HHH..jWjjWj..HHH....',
          '....HHH.JJjWWjJJHHH.....',
          '.....HH.JJJJJJJJHH......',
          '........JWWJJJJJ........',
          '........JWWJJJJJ........',
          '........JJJJJJJJ........',
          '........JJJJJJJJ........',
          '........PPPPPPPPP.......'
        ],
        legs: [
          '.......PPPPPPPPPPP......',
          '.........SS...SS........',
          '.........pp...pp........',
          '........WWWW.WWWW.......'
        ],
        walk: [
          '.......PPPPPPPPPPP......',
          '........SS.....SS.......',
          '.......pp.......pp......',
          '......WWWW.....WWWW.....'
        ]
      },
      eyeX: 6,
      eyes: { chill: 'ESEESSSSEESE', closed: 'ESssSSSSssSE', left: 'EEESSSSEESSE', right: 'ESSEESSSSEEE' }
    }
  };
  const EYE_Y = 10;
  const ART = {
    shades: { x: 6, y: 9, rows: ['KKKKKKKKKKKK', '.KkKK..KkKK.'] },
    // 站着伸懒腰 / 欢呼：两只手举过头顶
    armsUp: { x: 5, y: 0, rows: ['SS............SS'].concat(Array(10).fill('WW............WW'), ['.W............W.']) },
    gear: {
      band: { x: 4, y: 5, rows: ['GGGGGGGGGGGGGGGGG', 'GGGGGGGGGGWGGGGGGG'] },
      cap: {
        x: 3, y: 0, rows: [
          ',,,,,,,,,,,,,,,,,,',
          '.....GGGGGGGGG....',
          '...GGGGGGGGGGGGG..',
          '..GGGGGGGGGGGGGGG.',
          '..GGGGGGGGWGGGGGGG',
          '.GGGGGGGGGGGGGGGGG',
          'gggggggggggggggggggggg'
        ]
      },
      crown: { x: 9, y: -2, rows: ['A.AA.A', 'AaAAaA'] }
    },
    fx: {
      sweat: { x: 22, y: 7, rows: ['.B', 'BB', 'BB'] },
      zzz: { x: 20, y: -3, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
      note: { x: 20, y: -3, rows: ['.NNN', '.N.N', '.N..', 'NN..', 'NN..'] },
      sparkle: { x: 20, y: -3, rows: ['.X.', 'XXX', '.X.'] }
    }
  };
  const AW = 24, AH = 17, AH_STAND = 25;
  const M = 3;                 // 四周留白（描边 + 特效）；底下不留：胳膊 / 鞋直接搭在下面那个框的边上
  const GW = AW + M * 2, GH = AH + M;
  const POSES = ['lie', 'stand', 'walk', 'wave', 'stretch'];
  const heightOf = (pose) => (pose && pose !== 'lie' ? AH_STAND : AH) + M;

  /** 这个姿势这一帧的原图（不含眼睛、装备） */
  function poseRows(ch, pose, frame) {
    if (!pose || pose === 'lie') {
      const body = ch.body.slice();
      body[0] = ch.tufts[frame ? 1 : 0];
      return body;
    }
    const st = ch.stand;
    const head = st.head.slice();
    head[0] = ch.tufts[frame ? 1 : 0];
    const body = pose === 'wave' ? (frame ? st.wave2 : st.wave) : pose === 'stretch' ? st.stretch : st.body;
    const legs = pose === 'walk' && frame ? st.walk : st.legs;
    return head.concat(body, legs);
  }

  const HAIR = {
    black: { label: '黑', H: '#3a2d27', h: '#221a16', L: '#5a4840' },
    brown: { label: '棕', H: '#6b4a32', h: '#4a3322', L: '#8c6647' },
    ash: { label: '灰', H: '#7d7570', h: '#5b544f', L: '#a39a93' },
    blond: { label: '金', H: '#c9a04e', h: '#9c7a35', L: '#e2c077' }
  };
  const OUTFITS = {
    varsity: { label: '黑白棒球服', J: '#363843', W: '#f2f1ed', w: '#d4d3ce' },
    navy: { label: '藏青棒球服', J: '#23315c', W: '#f2f1ed', w: '#d4d3ce' },
    green: { label: '绿白棒球服', J: '#0f8f66', W: '#f2f1ed', w: '#d4d3ce' },
    black: { label: '全黑', J: '#2a2b32', W: '#454750', w: '#32343c' }
  };
  const BASE_COLORS = {
    S: '#f0c9a4', s: '#dcae8a', E: '#241a15', K: '#141519', k: '#5b6170',
    G: '#10b981', g: '#0a7a56', A: '#e7b53c', a: '#fbe08a',
    B: '#7cc4f5', Z: '#9aa3b5', N: '#9aa3b5', X: '#ffd84d', O: '#17120f',
    P: '#2b2c33', p: '#1c1d22'
  };
  const DEFAULT_LOOK = { show: true, hair: 'black', outfit: 'varsity' };

  // 心情：没记 / 犯困 / 四档健康度
  const MOODS = {
    idle: { eyes: 'chill' },
    sleepy: { eyes: 'closed', fx: 'zzz' },
    bad: { eyes: 'chill', fx: 'sweat' },
    ok: { eyes: 'chill' },
    good: { eyes: 'chill', fx: 'note' },
    great: { eyes: 'shades', fx: 'sparkle' }
  };
  const LEVEL_MOOD = ['bad', 'ok', 'good', 'great'];
  const GEAR_STEPS = [{ days: 3, gear: 'band', name: '头带' }, { days: 7, gear: 'cap', name: '棒球帽' }, { days: 30, gear: 'crown', name: '皇冠' }];

  /** 选过的样子 + 默认值；没选过角色就跟着性别 */
  function look(opts, gender) {
    const l = Object.assign({}, DEFAULT_LOOK, opts || {});
    if (!CHARS[l.char]) l.char = gender === 'female' ? 'girl' : 'boy';
    if (!HAIR[l.hair]) l.hair = DEFAULT_LOOK.hair;
    if (!OUTFITS[l.outfit]) l.outfit = DEFAULT_LOOK.outfit;
    return l;
  }

  /** 连续记录的天数 → 戴什么（只戴最好的那一样） */
  function gearFor(streak) {
    const s = GEAR_STEPS.filter(x => streak >= x.days).pop();
    return s ? [s.gear] : [];
  }

  /**
   * 拼出一帧像素图（不含特效）。
   * @param {{char, hair, outfit, mood, gear:string[], pose?:string, frame:0|1, eyes?:string}} o
   *   pose：lie 趴着（默认）/ stand 站着 / walk 走路 / wave 站着招手 / stretch 伸懒腰（举手欢呼）
   * @returns {{ w, h, px: string[][], colors: Object }}  px[y][x] 是颜色代码，'.' 透明
   */
  function compose(o) {
    o = o || {};
    const l = look(o);
    const ch = CHARS[l.char];
    const mood = MOODS[o.mood] || MOODS.idle;
    const pose = POSES.includes(o.pose) ? o.pose : 'lie';
    const H = heightOf(pose);
    const px = Array.from({ length: H }, () => Array(GW).fill('.'));
    const put = (x, y, rows) => rows.forEach((r, dy) => [...r].forEach((c, dx) => {
      const X = x + dx + M, Y = y + dy + M;
      if (c === '.' || Y < 0 || Y >= H || X < 0 || X >= GW) return;
      px[Y][X] = c === ',' ? '.' : c;
    }));
    put(0, 0, poseRows(ch, pose, o.frame));
    const eyes = o.eyes || mood.eyes;
    if (eyes === 'shades') put(ART.shades.x, ART.shades.y, ART.shades.rows);
    else put(ch.eyeX, EYE_Y, [ch.eyes[eyes] || ch.eyes.chill]);
    (o.gear || []).forEach(k => { const g = ART.gear[k]; if (g) put(g.x, g.y, g.rows); });
    if (pose === 'stretch') put(ART.armsUp.x, ART.armsUp.y, ART.armsUp.rows);
    // 描边：透明格子挨着有颜色的格子就涂深色
    const filled = (x, y) => y >= 0 && y < H && x >= 0 && x < GW && px[y][x] !== '.' && px[y][x] !== 'O';
    for (let y = 0; y < H; y++) for (let x = 0; x < GW; x++) {
      if (px[y][x] === '.' && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) px[y][x] = 'O';
    }
    const hair = HAIR[l.hair], outfit = OUTFITS[l.outfit];
    const colors = Object.assign({}, BASE_COLORS, { H: hair.H, h: hair.h, L: hair.L, J: outfit.J, W: outfit.W, w: outfit.w });
    return { w: GW, h: H, px, colors };
  }

  /** 特效单独一张（不描边），好让 CSS 让它飘、跳、闪 */
  function fxLayer(o, colors) {
    const mood = MOODS[o.mood] || MOODS.idle;
    const H = heightOf(o.pose);
    const px = Array.from({ length: H }, () => Array(GW).fill('.'));
    if (mood.fx) {
      const f = ART.fx[mood.fx];
      f.rows.forEach((r, dy) => [...r].forEach((c, dx) => {
        const X = f.x + dx + M, Y = f.y + dy + M;
        if (c !== '.' && Y >= 0 && Y < H && X >= 0 && X < GW) px[Y][X] = c;
      }));
    }
    return { px, colors, fx: mood.fx };
  }

  /** 像素图 → SVG 里的 path（每种颜色一条，横着连成段）；only：只要某些行 */
  function paths(img, only) {
    const by = {};
    img.px.forEach((row, y) => {
      if (only && !only(y)) return;
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === c) n++;
        if (c !== '.') (by[c] = by[c] || []).push(`M${x} ${y}h${n}v1h-${n}z`);
        x += n;
      }
    });
    return Object.keys(by).map(c => `<path fill="${img.colors[c]}" d="${by[c].join('')}"/>`).join('');
  }

  /**
   * 完整的 SVG。几层叠在一起，动不动、什么时候显示全由 CSS 管：
   *  bd-fa / bd-fb 头发两帧；bd-blink 眨眼、bd-lookl / bd-lookr 左右看（只盖眼睛那一行）；
   *  bd-fx 特效。
   *  站着的姿势（pose-stand / walk / wave / stretch）只有两帧，CSS 按姿势决定换帧快慢（走路、招手换得快）。
   */
  function svg(o) {
    const pose = POSES.includes(o.pose) ? o.pose : 'lie';
    const frame = (extra) => compose(Object.assign({}, o, { pose }, extra));
    const a = frame({ frame: 0 });
    const H = a.h;
    const mood = MOODS[o.mood] || MOODS.idle;
    const eyeRow = (y) => y === EYE_Y + M;
    let eyesLayers = '';
    if ((o.eyes || mood.eyes) === 'chill') {
      eyesLayers = `<g class="bd-blink">${paths(frame({ eyes: 'closed' }), eyeRow)}</g>` +
        `<g class="bd-lookl">${paths(frame({ eyes: 'left' }), eyeRow)}</g>` +
        `<g class="bd-lookr">${paths(frame({ eyes: 'right' }), eyeRow)}</g>`;
    }
    const fx = fxLayer(Object.assign({}, o, { pose }), a.colors);
    return `<svg class="buddy-svg pose-${pose}" viewBox="0 0 ${GW} ${H}" width="${GW * 2}" height="${H * 2}" shape-rendering="crispEdges" aria-hidden="true">` +
      `<g class="bd-fa">${paths(a)}</g><g class="bd-fb">${paths(frame({ frame: 1 }))}</g>` +
      eyesLayers +
      (fx.fx ? `<g class="bd-fx bd-fx-${fx.fx}">${paths(fx)}</g>` : '') +
      '</svg>';
  }

  /** 连续记录几天：今天记了从今天往前数；今天还没记就从昨天往前数（早上还没吃不算断） */
  function streakOf(dates, today) {
    const set = new Set(dates);
    const d = new Date(today + 'T12:00:00');
    const key = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!set.has(today)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(key())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /** 离下一个装备还差几天 */
  function nextGear(streak) {
    const s = GEAR_STEPS.find(x => x.days > streak);
    return s ? { name: s.name, days: s.days - streak } : null;
  }

  /**
   * 今天的心情和气泡里那句话。
   * @param g  TF.HealthGauge.evaluate 的结果；hour 现在几点；proteinLeft 蛋白还差几克
   */
  function moodOf(g, hour, proteinLeft) {
    if (!g || !g.hasData) {
      if (hour >= 22 || hour < 5) return { mood: 'sleepy', say: '困了…今天还没记呢' };
      return { mood: 'idle', say: hour < 10 ? '早。今天吃了啥，按住说一句' : '今天还没记，吃了啥说一句就行' };
    }
    const mood = LEVEL_MOOD[g.level] || 'ok';
    const d = g.detail || {}, p = g.parts || {};
    const pLeft = Math.round(proteinLeft || 0);
    if (g.level >= 3) return { mood, say: pLeft > 5 ? `今天吃得很稳。蛋白再补 ${pLeft}g 就满了` : '今天吃得很稳。' };
    // 挑最差的那一项说；「健康」档说得轻一点
    const soft = g.level === 2;
    const worst = ['energy', 'protein', 'fat'].filter(k => p[k] != null).sort((x, y) => p[x] - p[y])[0];
    let tip = '';
    if (d.overUl && d.overUl.length) tip = `${d.overUl[0].name}吃超上限了`;
    else if (worst === 'energy' && p.energy < 0.85) {
      tip = d.energyIssue === 'over' ? (soft ? '别再加餐了' : '今天吃多了，明天少吃一口') : (soft ? '晚上还能再吃点' : '今天吃得太少了，别饿着');
    } else if (worst === 'protein' && p.protein < 0.85 && pLeft > 0) tip = `蛋白质还差 ${pLeft}g`;
    else if (worst === 'fat' && p.fat < 0.85) tip = d.fatShare != null && d.fatShare < 0.2 ? '油太少了，吃点坚果鸡蛋' : (soft ? '稍微有点油' : '今天有点油');
    if (g.level === 2) return { mood, say: tip ? `还不错，${tip}` : pLeft > 5 ? `还不错，蛋白还差 ${pLeft}g` : '还不错，保持。' };
    return { mood, say: tip || (pLeft > 0 ? `蛋白质还差 ${pLeft}g` : '还行，再均衡一点') };
  }

  /** 没说重量时给的几个选项：估的那个，轻一档、重一档（整 2.5 / 5 公斤） */
  function liftOpts(w) {
    const step = w < 20 ? 2.5 : 5;
    const r = (x) => Math.max(step, Math.round(x / step) * step);
    let out = [...new Set([r(w * 0.65), r(w), r(w * 1.35)])];
    if (out.length < 3) out = [...new Set([Math.max(step, r(w) - step), r(w), r(w) + step])];
    return out.sort((x, y) => x - y);
  }
  TF.liftOpts = liftOpts;

  const Buddy = { CHARS, ART, HAIR, OUTFITS, DEFAULT_LOOK, MOODS, LEVEL_MOOD, GEAR_STEPS, POSES, W: GW, H: GH, heightOf, look, gearFor, compose, paths, svg, streakOf, nextGear, moodOf, liftOpts };
  TF.Buddy = Buddy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Buddy;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  buddyLook() { return TF.Buddy.look(this.profile.buddy, this.profile.gender); },

  /** 有记录的日子（饮食、训练、体重都算） */
  recordDates() {
    return this.diet.map(d => d.date).concat(this.workouts.map(w => w.date), this.weights.map(w => w.date));
  },

  /** 小人：跟着今天的健康度和连续记录天数变 */
  renderBuddy() {
    const btn = document.getElementById('buddy');
    if (!btn) return;
    const look = this.buddyLook();
    const show = (look.show || this._touring) && this.view === 'today' && !this.needsOnboarding;
    btn.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-buddy', show);
    if (!show) { this.buddyStop(); return; }
    const st = this.buddyState();
    this._buddySt = st;
    const moreFood = this._buddyCount != null && st.count > this._buddyCount;
    const rank = (g) => TF.Buddy.GEAR_STEPS.findIndex(x => x.gear === g[0]);
    const levelUp = this._buddyGear && rank(st.gear) > rank(this._buddyGear);
    const first = !btn.dataset.key;
    this.buddyDraw();
    if (levelUp) window.Sound && window.Sound.play('unlock', 0.6); // 连续记录拿到新装备：小琶音
    // 又记了一顿：站起来举手欢呼一下
    if (!first && (moreFood || levelUp)) this.buddyDo([['stretch', 750], ['stand', 250]]);
    this._buddyCount = st.count;
    this._buddyGear = st.gear;
    btn.setAttribute('aria-label', `小人：${st.say}`);
    this.placeBuddy();
    const pop = document.getElementById('buddy-pop');
    if (!pop.classList.contains('hidden') && !pop.dataset.mode) this.showBuddyPop();
  },

  buddyState() {
    const today = getTodayDateString();
    const s = this.getDaySummary(today);
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const g = TF.HealthGauge.evaluate({
      intake: s.intake, protein: s.protein, fat: s.fat, budget: s.budget, supps: s.supps, nutrients: s.nutrients,
      targetProteinG: this.gaugeProteinTarget(), hour
    });
    const dates = this.recordDates();
    const streak = TF.Buddy.streakOf(dates, today);
    const days = new Set(dates).size;
    const proteinLeft = Math.max(0, this.gaugeProteinTarget() - s.protein);
    const m = TF.Buddy.moodOf(g, hour, proteinLeft);
    const count = this.diet.filter(d => d.date === today).length + this.workouts.filter(w => w.date === today).length;
    return { mood: m.mood, say: m.say, level: g.hasData ? g.level : null, streak, days, gear: TF.Buddy.gearFor(streak), next: TF.Buddy.nextGear(streak), count };
  },

  /**
   * 趴在最上面那一层的上沿：打开的修改 / 分享面板 > 「记好了」提示条 / 录音面板 > 输入栏。
   * 小人是 position:fixed，用 transform 挪过去（CSS 里有过渡，看起来是跳过去的）。
   */
  placeBuddy() {
    const btn = document.getElementById('buddy');
    if (!btn || btn.classList.contains('hidden')) return;
    const shown = (el) => {
      if (!el || el.classList.contains('hidden')) return null;
      const r = el.getBoundingClientRect(); // 固定定位的元素没有 offsetParent，看它占不占地方
      return r.height > 0 ? r : null;
    };
    let target = null, z = 31;
    for (const id of ['edit-overlay', 'share-overlay']) {
      const ov = document.getElementById(id);
      const r = ov && !ov.classList.contains('hidden') && shown(ov.querySelector('.sheet'));
      if (r) { target = r; z = 101; break; }
    }
    if (!target) {
      target = shown(document.getElementById('composer'));
      [['ql-snackbar', 61], ['rec-panel', 41]].forEach(([id, zi]) => {
        const r = shown(document.getElementById(id));
        if (r && (!target || r.top < target.top)) { target = r; z = zi; }
      });
    }
    if (!target) { btn.style.visibility = 'hidden'; return; }
    btn.style.visibility = '';
    const x = Math.round(target.right - btn.offsetWidth - 20);
    const y = Math.round(target.top - btn.offsetHeight + 1);
    btn.style.zIndex = z;
    btn.style.transform = `translate(${x}px, ${y}px)`;
    this._buddyXY = { x, y };
    // 气泡开着：小人跳到哪（提示条弹出来、收回去），气泡跟到哪，别盖住提示条
    if (!document.getElementById('buddy-pop').classList.contains('hidden')) this.positionBuddyPop();
    // 第一次放好之后再打开过渡，别从左上角飞过来
    if (!btn.classList.contains('placed')) requestAnimationFrame(() => btn.classList.add('placed'));
  },

  /** 按现在的样子、心情、姿势画出来（样子没变就不重画） */
  buddyDraw() {
    const btn = document.getElementById('buddy');
    if (!btn || btn.classList.contains('hidden')) return;
    const look = this.buddyLook();
    const st = this._buddySt || this.buddyState();
    const pose = this._pose || 'lie';
    const key = [look.char, look.hair, look.outfit, st.mood, st.gear.join('+'), pose].join('|');
    if (btn.dataset.key === key) return;
    const posed = btn.dataset.pose !== pose;
    btn.dataset.key = key;
    btn.dataset.pose = pose;
    let move = btn.querySelector('.bd-move');
    if (!move) { btn.innerHTML = '<span class="bd-move"></span>'; move = btn.querySelector('.bd-move'); }
    move.innerHTML = TF.Buddy.svg({ char: look.char, hair: look.hair, outfit: look.outfit, mood: st.mood, gear: st.gear, pose });
    if (posed) this.placeBuddy(); // 站起来 / 趴下高度变了，底边还贴着那个框
  },

  buddyPose(pose) {
    this._pose = pose;
    this.buddyDraw();
  },

  reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  },

  /**
   * 一串动作：[[姿势, 毫秒, 开始时顺手做的事], …]，做完趴回去。新的动作会打断旧的。
   * 减少动态效果时只停在第一个姿势，不走来走去。
   */
  buddyDo(steps, then) {
    const token = this._actToken = (this._actToken || 0) + 1;
    clearTimeout(this._actTimer);
    const reduced = this.reducedMotion();
    let i = 0;
    const next = () => {
      if (token !== this._actToken) return;
      if (i >= steps.length) {
        this.buddyMove(0, 0);
        this.buddyPose(this._listening ? 'stand' : 'lie');
        this._acting = false;
        if (then) then();
        return;
      }
      const [pose, ms, fn] = steps[i++];
      this.buddyPose(reduced && pose === 'walk' ? 'stand' : pose);
      if (fn && !reduced) fn();
      this._actTimer = setTimeout(next, ms);
    };
    this._acting = true;
    next();
  },

  buddyStop() {
    this._actToken = (this._actToken || 0) + 1;
    clearTimeout(this._actTimer);
    this._acting = false;
    this.buddyMove(0, 0);
    if (this._pose && this._pose !== 'lie') { this._pose = 'lie'; this.buddyDraw(); }
  },

  /** 沿着那个框的边走：往左 x 像素，用 ms 毫秒走过去 */
  buddyMove(x, ms) {
    const move = document.querySelector('#buddy .bd-move');
    if (!move) return;
    move.style.transition = ms ? `transform ${ms}ms linear` : '';
    move.style.transform = x ? `translateX(${x}px)` : '';
  },

  /** 自己动一动：隔半分钟左右，伸个懒腰，或者站起来溜达两步 */
  buddyIdle() {
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => this.buddyIdle(), 20000 + Math.random() * 25000);
    const btn = document.getElementById('buddy');
    const busy = document.getElementById('composer').classList.contains('recording') || document.getElementById('composer').classList.contains('busy');
    if (document.hidden || !btn || btn.classList.contains('hidden') || this._acting || this._touring || this._listening || busy ||
        this.reducedMotion() || String(btn.style.zIndex) !== '31' || !document.getElementById('buddy-pop').classList.contains('hidden')) return;
    const r = Math.random();
    if (r < 0.4) {
      this.buddyDo([['stand', 350], ['stretch', 1100], ['stand', 300]]);
    } else if (r < 0.85) {
      // 往左溜达几步，停下来左右看看，再走回来
      this.buddyDo([
        ['stand', 300],
        ['walk', 1500, () => this.buddyMove(-48, 1500)],
        ['stand', 900],
        ['walk', 1500, () => this.buddyMove(0, 1500)],
        ['stand', 250]
      ]);
    } else {
      this.buddyDo([['stand', 900]]);
    }
  },

  /** 按住说话时站起来听着，说完趴回去 */
  buddyListen(on) {
    if (on === !!this._listening) return;
    this._listening = on;
    if (this._touring) return;
    if (on) { this.buddyStop(); this.buddyPose('stand'); }
    else if (!this._acting) this.buddyPose('lie');
  },

  showBuddyPop() {
    const pop = document.getElementById('buddy-pop');
    const st = this.buddyState();
    pop.dataset.mode = '';
    pop.dataset.level = st.level == null ? 'none' : String(st.level);
    const name = this.userName ? this.userName() : '';
    const head = (name ? `${esc(name)}，` : '') + (st.streak ? `连续记录 <b>${st.streak}</b> 天` : '今天开始记吧');
    const foot = [st.days ? `一共记了 ${st.days} 天` : '', st.next ? `再连续 ${st.next.days} 天拿${st.next.name}` : '头带、棒球帽、皇冠都拿到了'].filter(Boolean).join(' · ');
    // 一句观察（最近一周蛋白够不够、吃没吃超）和一句训练建议，都是本机算的
    const obs = this.observation ? this.observation() : '';
    const tip = this.trainingTip ? this.trainingTip() : '';
    pop.innerHTML = `<div class="buddy-pop-head">${head}</div><p class="buddy-say">${esc(st.say)}</p>` +
      (obs ? `<p class="buddy-obs">${esc(obs)}</p>` : '') +
      (tip ? `<p class="buddy-train">${esc(tip)}</p>` : '') + `<p class="buddy-foot">${esc(foot)}</p>`;
    this.positionBuddyPop();
    pop.classList.remove('hidden');
  },

  /** 气泡放在小人头顶（按小人要去的位置算，不按动画中途的位置） */
  positionBuddyPop() {
    const pop = document.getElementById('buddy-pop');
    const btn = document.getElementById('buddy');
    let top, right;
    if (btn.classList.contains('hidden') || btn.style.visibility === 'hidden') {
      const c = document.getElementById('composer').getBoundingClientRect();
      top = c.top - 4;
      right = 16;
    } else if (this._buddyXY) {
      top = this._buddyXY.y;
      right = window.innerWidth - (this._buddyXY.x + btn.offsetWidth);
    } else {
      const r = btn.getBoundingClientRect();
      top = r.top;
      right = window.innerWidth - r.right;
    }
    pop.style.bottom = Math.round(window.innerHeight - top + 4) + 'px';
    pop.style.right = Math.max(12, Math.round(right)) + 'px';
    pop.style.maxHeight = pop.dataset.mode === 'answer' || pop.dataset.mode === 'thinking' ? Math.max(160, Math.round(top - 24)) + 'px' : '';
  },

  /**
   * 听着像提问：一松手小人就站起来，气泡里「我想想…」，下面一行隔几秒换一句，让人知道它在干活
   * （Atria 要 10～25 秒才出第一个字）
   */
  showBuddyThinking(question) {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    clearInterval(this._thinkT);
    const q = String(question || '').replace(/\s+/g, ' ').trim();
    const eat = /吃|食谱|菜谱|蛋白|热量|碳水|饿/.test(q), lift = /练|训练|健身|动作/.test(q);
    const steps = ['我想想…', '先看看你今天吃了多少…', eat ? '算算还差多少蛋白、还能吃多少…' : '翻翻你最近的训练…',
      eat && lift ? '把吃和练一起排一排…' : eat ? '在排吃什么、吃多少…' : lift ? '在排动作、重量和组数…' : '快好了…', '快好了，再等一下下…'];
    pop.dataset.mode = 'thinking';
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="buddy-pop-head">${esc(q.length > 26 ? q.slice(0, 25) + '…' : q)}</div>` +
      `<p class="buddy-think"><span class="think-dots"><i></i><i></i><i></i></span><span class="think-line">${steps[0]}</span></p>`;
    this.positionBuddyPop();
    this.popIn(pop);
    let i = 0;
    this._thinkT = setInterval(() => {
      const line = pop.querySelector('.think-line');
      if (pop.dataset.mode !== 'thinking' || !line) { clearInterval(this._thinkT); return; }
      i = Math.min(i + 1, steps.length - 1);
      line.textContent = steps[i];
    }, 3500);
    if (!this._touring) { this.buddyStop(); this.buddyPose('stand'); }
  },

  /** 气泡弹出来的动画（每次重新弹） */
  popIn(pop) {
    this._popAt = Date.now(); // 逛的时候凑过来说话要隔开一会儿
    pop.classList.remove('hidden', 'pop-spring');
    void pop.offsetWidth;
    pop.classList.add('pop-spring');
  },

  /** 回答来了：小人跳一下、头上冒「!」、招手 */
  buddyBang(mark) {
    const btn = document.getElementById('buddy');
    if (!btn) return;
    btn.dataset.bang = mark || '!';
    btn.classList.remove('bang');
    void btn.offsetWidth;
    btn.classList.add('bang');
    clearTimeout(this._bangT);
    this._bangT = setTimeout(() => btn.classList.remove('bang'), 1300);
    window.Haptics && window.Haptics.fire('tap');
    window.Sound && window.Sound.play('blip');
    if (!this._touring) this.buddyDo([['stand', 120], ['wave', 1100], ['stand', 600]]);
  },

  /**
   * 小人回答问题（「明天吃什么」「还差多少蛋白」）。opts：
   *  streaming —— 大模型还在出字，只更新文字；
   *  plan / baseDate —— 回答是一份计划：下面「加到明天」「改一改」；
   *  again —— 点小人再看一次，不跳不响。
   * 点空白处收起；半小时内点小人能再看一次
   */
  showBuddyAnswer(question, answer, opts) {
    opts = opts || {};
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    const q = String(question || '').replace(/\s+/g, ' ').trim();
    const fresh = pop.dataset.mode !== 'answer' || pop.dataset.q !== q || pop.classList.contains('hidden');
    clearInterval(this._thinkT);
    // 还在出字、气泡已经在显示这一问：只换文字，不重画、不重复跳
    if (opts.streaming && !fresh) {
      const el = pop.querySelector('.buddy-answer');
      if (el) {
        el.textContent = answer;
        el.classList.toggle('typing', !opts.planning);
        const wait = pop.querySelector('.buddy-wait');
        if (wait && wait.classList.contains('hidden') === !!opts.planning) { wait.classList.toggle('hidden', !opts.planning); this.positionBuddyPop(); }
        return;
      }
    }
    if (!opts.streaming) this._lastAnswer = { question, answer, at: Date.now(), plan: opts.plan, baseDate: opts.baseDate, next: opts.next };
    const plan = !opts.streaming && opts.plan;
    // 一天的计划，或者排了好几天的训练（plan.days）
    const base = opts.baseDate || getTodayDateString();
    const days = plan ? (plan.days || [plan]).map(d => Object.assign({}, d, { date: shiftDateString(base, d.dayOffset || 0) })) : [];
    const planDate = days.length ? days[0].date : '';
    if (plan) {
      // 15 分钟内说「不要米饭换红薯」，大模型知道改的是哪份计划
      this._planOffer = { at: Date.now(), text: this.planText(plan, base) };
    }
    pop.dataset.mode = 'answer';
    pop.dataset.q = q;
    pop.dataset.level = 'none';
    const dayWord = (d) => (d === getTodayDateString() ? '今天' : d === shiftDateString(getTodayDateString(), 1) ? '明天' : `${+d.slice(5, 7)}月${+d.slice(8)}日`);
    const added = plan && (this.plans || []).some(x => x.date === planDate && x.from === this._lastAnswer.at);
    const where = days.length > 1 ? `这 ${days.length} 天` : dayWord(planDate);
    // 有计划：动作、吃的画成一张张清单（按天分组），回答里已经画进清单的那几行就不重复了，只留说明
    const shownText = plan ? this.planNotes(answer, days) : answer;
    pop.innerHTML = `<div class="buddy-pop-head">${esc(q.length > 26 ? q.slice(0, 25) + '…' : q)}</div>` +
      (shownText ? `<p class="buddy-answer${opts.streaming && !opts.planning ? ' typing' : ''}${plan ? ' notes' : ''}">${esc(shownText)}</p>` : '') +
      (plan ? this.planPreview(days, dayWord) : '') +
      (opts.streaming ? `<p class="buddy-wait${opts.planning ? '' : ' hidden'}">正在排成计划，好了能一键加上<span class="think-dots"><i></i><i></i><i></i></span></p>` : '') +
      (plan ? `<div class="buddy-acts"><button class="buddy-act" type="button" data-pa="edit">改一改</button>` +
        `<button class="buddy-act primary" type="button" data-pa="add"${added ? ' disabled' : ''}>${added ? '✓ 已加到' : '加到'}${where}</button></div>` +
        `<p class="buddy-tip hidden">按住下面的按钮说要改的地方，比如「不要米饭，换成红薯」「蛋白再多一点」</p>` : '') +
      (opts.streaming ? '' : this.nextChips(opts.next) + '<button class="buddy-more" type="button">看看连续记录 ›</button>');
    this.bindNextChips(pop);
    const more = pop.querySelector('.buddy-more');
    if (more) more.addEventListener('click', (e) => { e.stopPropagation(); this.showBuddyPop(); });
    pop.querySelectorAll('[data-pa]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.dataset.pa === 'add') {
        const from = this._lastAnswer.at;
        const n = days.reduce((t, d) => t + this.addPlans(d.date, Object.assign({}, d, { from }), true), 0);
        this.saveData();
        b.disabled = true;
        b.textContent = `✓ 已加到${where}`;
        window.Haptics && window.Haptics.fire('success');
        window.Sound && window.Sound.play('success');
        if (!this._touring) this.buddyDo([['stand', 100], ['wave', 900], ['stand', 300]]);
        // 清单一行一行打上勾，然后跳到那天，计划一行行落下来
        const rows = [...pop.querySelectorAll('.pp-row')];
        const quick = this.reducedMotion();
        rows.forEach((r, i) => (quick ? r.classList.add('in') : setTimeout(() => r.classList.add('in'), 120 + i * 70)));
        setTimeout(() => {
          this.closeBuddyPop('answer');
          this.selectedDate = planDate;
          this.render();
          this.landPlanRows();
          this.showToast(days.length > 1 ? `排好了 ${days.length} 天，练完点 ✓ 就记上` : `加了 ${n} 条，做完点 ✓ 就记上`);
        }, quick ? 300 : 120 + rows.length * 70 + 700);
      } else {
        pop.querySelector('.buddy-tip').classList.remove('hidden');
        const talk = document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text');
        if (talk) { talk.classList.add('tour-glow'); setTimeout(() => talk.classList.remove('tour-glow'), 2600); }
        this.positionBuddyPop();
      }
    }));
    this.positionBuddyPop();
    if (fresh) {
      pop.scrollTop = 0;
      this.popIn(pop);
      document.getElementById('gauge-pop').classList.add('hidden');
      if (!opts.again) this.buddyBang();
    }
  },

  /**
   * 记好之后小人问一句（不拦着用户、不再调大模型），一个一个问，最多 3 个：
   *  - 份量说得含糊（「一瓶甜牛奶」「一串烤白果」）：已经按最常见的大小记上了，点一个按克数比例改、并记住，下次不问；
   *  - 新手练了个没练过的动作、没说重量：已经按常见的估了，点一个差不多的重量，或者「记不清」。
   * 不点也行，点空白处收起，半分钟后自己收起。
   * @param asks [{kind: 'food', id: 记录 id, index: 第几样, name, amount, grams, opts: [{label, grams}]}
   *              | {kind: 'lift', id, name, saidReps}]
   */
  askPortion(asks) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return;
    const list = (asks || []).filter(Boolean);
    if (!list.length) return;
    const a = list[0];
    const next = () => this.askPortion(list.slice(1));
    let q, opts, near, foot, apply, done;
    if (a.kind === 'lift') {
      const rec = this.workouts.find(w => w.id === a.id);
      if (!rec || !(rec.weightKg > 0)) { next(); return; }
      opts = TF.liftOpts(rec.weightKg).map(kg => ({ label: `${kg}kg`, kg }));
      near = opts.find(o => o.kg === rec.weightKg) || opts[1] || opts[0];
      q = `${a.name}用了多重？`;
      foot = `先按 ${round1(rec.weightKg)}kg 记了，差不多就行`;
      apply = (o) => this.applyLiftWeight(a, o.kg);
      done = (o) => `✓ 好，下次就从 ${o.kg}kg 往上加`;
    } else {
      const rec = this.diet.find(d => d.id === a.id);
      const item = rec && rec.items && rec.items[a.index];
      if (!item || item.name !== a.name || !a.opts || a.opts.length < 2) { next(); return; }
      opts = a.opts;
      near = opts.reduce((m, o) => (Math.abs(o.grams - item.grams) < Math.abs(m.grams - item.grams) ? o : m), opts[0]);
      q = `${a.name}${a.amount ? ' ' + a.amount : ''}，大概多少？`;
      foot = `先按「${near.label}」记了 · 选了我就记住，下次不问`;
      apply = (o) => this.applyPortion(a, o);
      done = (o) => `✓ 记住了，下次${a.name}${a.amount || ''}就按${o.label}`;
    }
    pop.dataset.mode = 'ask';
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="buddy-pop-head">问一句${list.length > 1 ? `（还有 ${list.length - 1} 个）` : ''}</div>` +
      `<p class="buddy-q">${esc(q)}</p>` +
      `<div class="portion-opts">${opts.map((o, i) => `<button class="portion-opt${o === near ? ' on' : ''}" type="button" data-i="${i}">${esc(o.label)}</button>`).join('')}` +
      (a.kind === 'lift' ? '<button class="portion-opt skip" type="button" data-skip="1">记不清</button>' : '') + '</div>' +
      `<p class="buddy-foot">${esc(foot)}</p>`;
    const finish = (text) => {
      clearTimeout(this._askT);
      if (list.length > 1) { setTimeout(() => { if (pop.dataset.mode === 'ask') next(); }, 450); return; }
      pop.querySelector('.buddy-foot').textContent = text;
      if (!this._touring) this.buddyDo([['stand', 120], ['wave', 700], ['stand', 300]]);
      this._askT = setTimeout(() => this.closeBuddyPop('ask'), 1600);
    };
    pop.querySelectorAll('.portion-opt').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      pop.querySelectorAll('.portion-opt').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.skip) { finish('没事，先这么记着，想起来点开那条改'); return; }
      const o = opts[+b.dataset.i];
      apply(o);
      window.Sound && window.Sound.play('success');
      finish(done(o));
    }));
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    // 没理它：过一会儿自己收起来（已经按最常见的记上了）
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('ask'), 30000);
  },

  /** 选了重量：改那条训练，消耗按新重量重算；组数次数也说了的，就不再标「估的」 */
  applyLiftWeight(a, kg) {
    const rec = this.workouts.find(w => w.id === a.id);
    if (!rec || !(kg > 0)) return;
    const was = `${rec.exerciseName} ${round1(rec.weightKg)}kg`;
    rec.weightKg = kg;
    // 提示条还在的话，那一行也跟着改
    document.querySelectorAll('#ql-snack-list .ql-snack-line').forEach(el => {
      if (el.textContent.includes(was)) el.textContent = el.textContent.replace(was, `${rec.exerciseName} ${kg}kg`).replace('（估）', '');
    });
    rec.burnedCalories = Math.round((rec.sets || 3) * (rec.reps || 10) * (kg * 0.05 + 1.2));
    if (a.saidReps && /估计/.test(rec.notes || '')) rec.notes = '一键记录';
    this.saveData();
    this.render();
  },

  /** 按选的大小改那一样：热量、蛋白质等按克数比例换算，合计重算，记住这个份量 */
  applyPortion(a, o) {
    const rec = this.diet.find(d => d.id === a.id);
    const item = rec && rec.items && rec.items[a.index];
    if (!item || item.name !== a.name || !(item.grams > 0) || !(o.grams > 0)) return; // 这期间被改过 / 删了
    const f = o.grams / item.grams;
    ['calories', 'proteinG', 'carbsG', 'fatG'].forEach(k => { item[k] = k === 'calories' ? Math.round((item[k] || 0) * f) : round1((item[k] || 0) * f); });
    if (item.nutrients) Object.keys(item.nutrients).forEach(k => { item.nutrients[k] = round1(item.nutrients[k] * f); });
    item.grams = o.grams;
    item.amount = `${a.amount}（${o.label}）`;
    Object.assign(rec, TF.sumItems(rec.items));
    this.rememberFood({ name: item.name, amount: item.amount, grams: item.grams, calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG });
    this.saveData();
    this.render();
  },

  /**
   * 新手第一周：每次记完，小人最多说一句和刚才相关的话，每句只说一次（存在 tf_tips）。
   * 不加按钮、不加页面，点空白处或过几秒自己收起。说了返回 true。
   */
  newbieTip(result) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring || !result) return false;
    const today = getTodayDateString();
    const first = this.diet.concat(this.workouts).reduce((m, r) => (r.date < m ? r.date : m), today);
    if (first < shiftDateString(today, -6)) return false; // 用了一周以上
    let seen;
    try { seen = JSON.parse(localStorage.getItem('tf_tips') || '[]'); } catch (e) { seen = []; }
    if (!Array.isArray(seen)) seen = [];
    const n = this.diet.length + this.workouts.length;
    const simple = this.isSimple();
    const tips = [
      ['lift', (result.workouts || []).some(w => w.estimated && !w.durationMin), '下次带上几公斤、几组几个，我帮你算下次练多少。叫不出名字就描述一下，比如「坐着往前推的那个机器」。'],
      ['oneby', n <= 3, '吃完一顿说一句就行，不用攒到晚上一口气说完。说不准多少也没事，我会猜，猜不准会问你。'],
      ['ask', n >= 4, simple ? '也可以问我，比如「晚上吃点啥」「今天还能吃多少」。' : '也可以问我，比如「晚上吃点啥」「明天练什么」。'],
      ['memo', n >= 6 && !this.memoList().length, '跟我说说你自己吧，比如「我叫阿程，健身新手，不吃辣」，我会记住，以后都照着来。']
    ];
    const pick = tips.find(t => t[1] && !seen.includes(t[0]));
    if (!pick) return false;
    seen.push(pick[0]);
    try { localStorage.setItem('tf_tips', JSON.stringify(seen)); } catch (e) {}
    const name = this.userName();
    this.sayTip((name ? name + '，' : '') + pick[2]);
    return true;
  },

  /** 小人主动说一句（新手提示、记完后的提醒）：冒「!」，招手，几秒后自己收起；next 是可以点的「接着问」 */
  sayTip(text, next) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return;
    pop.dataset.mode = 'tip';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say">${esc(text)}</p>` + this.nextChips(next);
    this.bindNextChips(pop);
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang();
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('tip'), 9000);
  },

  /** 「接着问」：回答下面两句可以直接点的问题，点了就跟按住说出来一样 */
  nextChips(next) {
    const list = (next || []).filter(Boolean).slice(0, 2);
    return list.length ? `<div class="buddy-next">${list.map(q => `<button class="next-chip" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
  },

  bindNextChips(pop) {
    pop.querySelectorAll('.next-chip').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      clearTimeout(this._askT);
      if (window.QuickLog) window.QuickLog.submit(b.dataset.q);
    }));
  },

  /**
   * 记完以后，该提醒的时候小人说一句（本机算，不调大模型）：破纪录了、晚上了蛋白还差很多、今天第一次吃超了、
   * 中午了蛋白还很少。每种一天最多一次（tf_coach），只看今天的记录。说了返回 true。
   */
  coachTip(result, batch) {
    const today = getTodayDateString();
    if (!batch || batch.date !== today) return false;
    let said;
    try { said = JSON.parse(localStorage.getItem('tf_coach') || '{}'); } catch (e) { said = {}; }
    if (said.date !== today) said = { date: today, kinds: [] };
    const fire = (kind, text, next) => {
      if (said.kinds.includes(kind)) return false;
      said.kinds.push(kind);
      try { localStorage.setItem('tf_coach', JSON.stringify(said)); } catch (e) {}
      const name = this.userName();
      this.sayTip((name && !kind.startsWith('pr:') ? name + '，' : '') + text, next);
      return true;
    };
    // 破纪录：这次的重量比以前都重
    for (const id of batch.workoutIds || []) {
      const w = this.workouts.find(x => x.id === id);
      const fb = w && this.liftFeedback(w);
      if (fb && fb.includes('新纪录')) return fire('pr:' + w.exerciseName, `新纪录！${w.exerciseName} ${fb.replace(/^[^：]*：新纪录\s*/, '')}`, [`${w.exerciseName.replace(/^(杠铃|哑铃)/, '')}下次练多少`, '这周练了几次']);
    }
    if (!(result.meals || []).length) return false;
    const s = this.getDaySummary(today);
    const hour = new Date().getHours();
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
    const left = Math.round(target - s.protein);
    const rem = Math.round(s.budget - s.intake);
    if (rem < -100) return fire('over', `今天超了 ${fmt(-rem)} kcal。没事，明天早餐清淡点就回来了。`, ['明天怎么吃', '这周热量赤字怎么样']);
    if (this.isSimple()) return false;
    if (hour >= 18 && target > 0 && left >= 30) {
      return fire('protein-pm', `蛋白还差 ${left}g，睡前补上：${this.proteinFix(left)}。`, ['晚上吃点啥能补蛋白', '今天还能吃多少']);
    }
    if (hour >= 11 && hour < 15 && target > 0 && s.protein < target * 0.25) {
      return fire('protein-noon', `到中午蛋白才 ${Math.round(s.protein)}g，晚上多吃点肉蛋奶。`, ['晚上吃点啥能补蛋白']);
    }
    return false;
  },

  /** 气泡里的计划清单：按天一组，每行一个勾、名字、份量 / 重量，动作下面一句要点 */
  planPreview(days, dayWord) {
    const WK = '日一二三四五六';
    let k = 0;
    return '<div class="plan-preview">' + days.map(d => {
      const meals = d.meals || [], lifts = d.workouts || [];
      const kcal = meals.reduce((t, m) => t + (m.calories || 0), 0);
      const prot = meals.reduce((t, m) => t + (m.proteinG || 0), 0);
      const right = kcal ? `约 ${fmt(kcal)} kcal · 蛋白 ${fmt(prot)}g` : `${lifts.length} 个动作`;
      const wd = WK[new Date(d.date + 'T00:00:00').getDay()];
      const rows = meals.map(m => ({ tag: m.mealType.replace('/补剂', ''), name: m.foodSummary, val: `${fmt(m.calories)} kcal` }))
        .concat(lifts.map(w => ({ tag: w.durationMin ? '有氧' : '', name: w.exerciseName, tip: w.tip,
          val: w.durationMin ? `${w.durationMin} 分钟` : `${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}` })));
      return `<div class="pp-day"><div class="pp-head"><b>${esc(dayWord(d.date))} · 周${wd}</b><span>${esc(right)}</span></div>` +
        rows.map(r => `<div class="pp-row" style="--i:${k++}"><span class="pp-tick"></span><div class="pp-main">` +
          `<div class="pp-title">${r.tag ? `<em>${esc(r.tag)}</em>` : ''}${esc(r.name)}</div>${r.tip ? `<div class="pp-tip">${esc(r.tip)}</div>` : ''}</div>` +
          `<span class="pp-val">${esc(r.val)}</span></div>`).join('') + '</div>';
    }).join('') + '</div>';
  },

  /** 回答里没画进清单的那几行（「重量先轻点」「练完喝杯蛋白粉」），最多 3 行 */
  planNotes(answer, days) {
    const names = [];
    days.forEach(d => {
      (d.workouts || []).forEach(w => names.push(w.exerciseName));
      (d.meals || []).forEach(m => (m.items || []).forEach(i => names.push(i.name)));
    });
    const keys = names.filter(n => n && n.length >= 2).map(n => n.slice(0, 4));
    return String(answer || '').split('\n').filter(l => l.trim() && !keys.some(n => l.includes(n))).slice(0, 3).join('\n');
  },

  /** 加进计划后跳到那天：计划一行行落下来，滚到看得见 */
  landPlanRows() {
    const rows = [...document.querySelectorAll('#timeline .item.plan')];
    if (!rows.length) return;
    rows.forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('land'); });
    rows[0].scrollIntoView({ block: 'center', behavior: this.reducedMotion() ? 'auto' : 'smooth' });
    setTimeout(() => rows.forEach(r => r.classList.remove('land')), 1800 + rows.length * 70);
  },

  /** 计划写成几行字（给大模型看「刚才给的计划」） */
  planText(plan, base) {
    const one = (p) => (p.meals || []).map(m => `${m.mealType} ${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG || 0}`)
      .concat((p.workouts || []).map(w => `训练 ${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : (w.weightKg > 0 ? w.weightKg + 'kg' : '自重') + ` ${w.sets}×${w.reps}`}`));
    if (!plan.days) return one(plan).join('\n');
    return plan.days.map(d => { const dt = shiftDateString(base || getTodayDateString(), d.dayOffset || 0); return `${+dt.slice(5, 7)}月${+dt.slice(8)}日：${one(d).join('；')}`; }).join('\n');
  },

  /** 提问没整理出来：气泡里说清楚，能重试（卡片也留着） */
  showBuddyFailed(p, reason) {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    clearInterval(this._thinkT);
    pop.dataset.mode = 'answer';
    pop.dataset.q = '';
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="buddy-pop-head">${esc(String(p.text || '').slice(0, 25))}</div>` +
      `<p class="buddy-answer">没想出来：${esc(reason || '网络不好')}</p>` +
      `<div class="buddy-acts"><button class="buddy-act primary" type="button" data-pa="retry">再试一次</button></div>`;
    pop.querySelector('[data-pa="retry"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showBuddyThinking(p.text);
      if (this.pending.some(x => x.id === p.id)) this.retryPending(p.id);
      else if (window.QuickLog) window.QuickLog.submit(p.text);
    });
    this.positionBuddyPop();
    this.popIn(pop);
    if (!this._touring) this.buddyPose('lie');
  },

  /** 收起某一种气泡（比如猜成提问其实是记录：把「我想想」收起来） */
  closeBuddyPop(mode) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || (mode && pop.dataset.mode !== mode)) return;
    clearInterval(this._thinkT);
    pop.classList.add('hidden');
    if (!this._touring && !this._acting) this.buddyPose('lie');
  },

  /** 有话在整理（大模型还没回来）：小人头上冒「…」 */
  buddyThinking() {
    const btn = document.getElementById('buddy');
    if (btn) btn.classList.toggle('thinking', (this.pending || []).some(p => p.status === 'working'));
  },

  bindBuddy() {
    const btn = document.getElementById('buddy');
    const pop = document.getElementById('buddy-pop');
    const close = () => { pop.classList.add('hidden'); clearInterval(this._thinkT); clearTimeout(this._askT); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      window.Sound && window.Sound.play('blip');
      if (this._touring) { this.tourNext(); return; }
      this.buddyDo([['wave', 1800], ['stand', 400]]);
      document.getElementById('gauge-pop').classList.add('hidden');
      if (!pop.classList.contains('hidden')) { close(); return; }
      // 半小时内问过问题：先给刚才的回答，里面能点去看连续记录
      const a = this._lastAnswer;
      if (a && Date.now() - a.at < 30 * 60 * 1000) this.showBuddyAnswer(a.question, a.answer, { again: true, plan: a.plan, baseDate: a.baseDate, next: a.next });
      else this.showBuddyPop();
    });
    // 温度计的弹窗和小人的气泡不同时开
    document.getElementById('thermo').addEventListener('click', close);
    document.addEventListener('click', (e) => { if (!pop.contains(e.target)) close(); });
    // 页面滚动就收起（回答很长时在气泡里面滚动不算）
    window.addEventListener('scroll', (e) => { if (!pop.contains(e.target)) close(); }, { passive: true, capture: true });
    // 下面那一层出现 / 消失 / 变高（提示条、录音、面板、键盘弹起）时跟着跳过去
    const place = () => {
      const c = document.getElementById('composer').classList;
      this.buddyListen(c.contains('recording'));
      this.placeBuddy();
      clearTimeout(this._buddyPlaceT);
      this._buddyPlaceT = setTimeout(() => this.placeBuddy(), 260);
    };
    window.addEventListener('resize', () => { close(); place(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', place);
    const ids = ['ql-snackbar', 'rec-panel', 'composer', 'edit-overlay', 'share-overlay'];
    const mo = new MutationObserver(place);
    ids.forEach(id => { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }); });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(place);
      ids.forEach(id => { const el = document.getElementById(id); if (el) ro.observe(el); });
      document.querySelectorAll('.sheet').forEach(el => ro.observe(el));
    }
    // 过了零点、晚上犯困：回到前台时重画一下
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.buddyStop(); return; }
      this.renderBuddy();
      clearTimeout(this._greetT);
      this._greetT = setTimeout(() => this.greetToday && this.greetToday(), 1500);
    });
    // 打开 App：小人打个招呼（每天第一次）
    clearTimeout(this._greetT);
    this._greetT = setTimeout(() => this.greetToday && this.greetToday(), 2200);
    // 逛的时候（发呆、翻以前的日子、翻记录、看趋势）有时凑过来说一句
    this.watchBrowse && this.watchBrowse();
    this.buddyIdle();
    this.bindTour();
  },

  // ================= 新手教程：小人带着看三步 =================
  tourSteps() {
    const simple = this.isSimple();
    return [
      { pose: 'wave', target: () => document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text'),
        text: simple ? '嗨，我陪你记。按住下面这个按钮，说说今天吃了啥，松手就记好了。' : '嗨，我陪你记。按住下面这个按钮，说说练了啥、吃了啥，一句一句说、一大段一起说都行，松手就记好了。',
        eg: simple ? '「早上包子豆浆，中午黄焖鸡」' : '「卧推80公斤4组8个，中午黄焖鸡」' },
      { pose: 'stand', target: () => document.getElementById('timeline'),
        text: '说错了不用改字，再说一句「改成一碗」「删掉奶茶」就行。点开一条也能改。' },
      { pose: 'stretch', target: () => document.getElementById('thermo'),
        text: '右上角这根温度计告诉你今天吃得健不健康。点我能看连续记了几天——连着记，我会换装备哦。' }
    ];
  },

  startTour() {
    if (this.view !== 'today') this.switchView('today');
    this._touring = true;
    this._tourStep = 0;
    document.getElementById('buddy-pop').classList.add('hidden');
    this.renderBuddy();
    this.buddyStop();
    setTimeout(() => this.showTourStep(), 250);
  },

  showTourStep() {
    const steps = this.tourSteps();
    const step = steps[this._tourStep];
    const pop = document.getElementById('tour-pop');
    document.querySelectorAll('.tour-glow').forEach(el => el.classList.remove('tour-glow'));
    if (!step) { this.endTour(); return; }
    this._pose = step.pose;
    this.buddyDraw();
    const t = step.target && step.target();
    if (t) t.classList.add('tour-glow');
    const last = this._tourStep === steps.length - 1;
    pop.innerHTML = `<p class="tour-text">${esc(step.text)}</p>${step.eg ? `<p class="tour-eg">${esc(step.eg)}</p>` : ''}` +
      `<div class="tour-actions"><button type="button" class="tour-skip" data-tour="skip">${last ? '' : '跳过'}</button>` +
      `<span class="tour-dots">${steps.map((_, i) => `<i class="${i === this._tourStep ? 'on' : ''}"></i>`).join('')}</span>` +
      `<button type="button" class="tour-next" data-tour="next">${last ? '开始吧' : '下一步'}</button></div>`;
    pop.classList.remove('hidden');
    const place = () => {
      const r = document.getElementById('buddy').getBoundingClientRect();
      pop.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
      pop.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
    };
    place();
    setTimeout(place, 320);
  },

  tourNext() {
    this._tourStep++;
    window.Sound && window.Sound.play('blip');
    this.showTourStep();
  },

  endTour() {
    this._touring = false;
    try { localStorage.setItem('tf_tour', 'done'); } catch (e) {}
    document.getElementById('tour-pop').classList.add('hidden');
    document.querySelectorAll('.tour-glow').forEach(el => el.classList.remove('tour-glow'));
    this._pose = 'lie';
    this.renderBuddy();
    this.buddyDraw();
  },

  /** 第一次用（新装的走完引导、老用户升级后）自动带一遍；设置里能再看 */
  maybeTour() {
    let done = false;
    try { done = localStorage.getItem('tf_tour') === 'done'; } catch (e) {}
    if (done || this.needsOnboarding || this._touring) return;
    setTimeout(() => { if (!this.needsOnboarding && this.view === 'today' && !this._touring) this.startTour(); }, 900);
  },

  bindTour() {
    const pop = document.getElementById('tour-pop');
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-tour]');
      if (!b) return;
      if (b.dataset.tour === 'skip') this.endTour(); else this.tourNext();
    });
    const again = document.getElementById('buddy-tour');
    if (again) again.addEventListener('click', () => this.startTour());
    window.addEventListener('resize', () => { if (this._touring) this.showTourStep(); });
    this.maybeTour();
  },

  /** 设置 →「外观」里的小人：预览、角色、发色、衣服、显示开关 */
  renderBuddySettings() {
    const look = this.buddyLook();
    const $ = (id) => document.getElementById(id);
    if (!$('buddy-preview')) return;
    const st = this.buddyState();
    $('buddy-preview').innerHTML = TF.Buddy.svg({ char: look.char, hair: look.hair, outfit: look.outfit, mood: 'ok', gear: st.gear });
    document.querySelectorAll('#buddy-char .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === look.char));
    const sw = (group, list, cur, fill) => {
      $(group).innerHTML = Object.keys(list).map(k => `<button type="button" class="swatch${k === cur ? ' on' : ''}" data-value="${k}" aria-label="${list[k].label}" title="${list[k].label}" style="${fill(list[k])}"></button>`).join('');
    };
    sw('buddy-hair', TF.Buddy.HAIR, look.hair, (h) => `background:${h.H}`);
    sw('buddy-outfit', TF.Buddy.OUTFITS, look.outfit, (o) => `background:linear-gradient(90deg, ${o.W} 0 30%, ${o.J} 30% 70%, ${o.W} 70%)`);
    $('buddy-show').checked = look.show;
    $('buddy-chatty').checked = (this.profile.buddy || {}).chatty !== false;
    $('buddy-chatty').disabled = !look.show;
    $('buddy-note').textContent = (st.streak ? `连续记录 ${st.streak} 天。` : '') + '趴在「按住说话」上面，点它会打招呼；连续记 3 天戴头带，7 天戴棒球帽，30 天戴皇冠。';
  },

  bindBuddySettings() {
    const set = (patch) => {
      this.profile.buddy = Object.assign(this.buddyLook(), patch);
      this.saveData();
      this.renderBuddySettings();
      this.renderBuddy();
      window.Haptics && window.Haptics.fire('tick');
    };
    const pick = (id, key) => document.getElementById(id).addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) set({ [key]: b.dataset.value });
    });
    pick('buddy-hair', 'hair');
    pick('buddy-outfit', 'outfit');
    document.getElementById('buddy-char').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (b) set({ char: b.dataset.value });
    });
    document.getElementById('buddy-show').addEventListener('change', (e) => set({ show: e.target.checked }));
    document.getElementById('buddy-chatty').addEventListener('change', (e) => set({ chatty: e.target.checked }));
  }
});
