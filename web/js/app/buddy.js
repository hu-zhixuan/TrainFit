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

  const Buddy = { CHARS, ART, HAIR, OUTFITS, DEFAULT_LOOK, MOODS, LEVEL_MOOD, GEAR_STEPS, POSES, W: GW, H: GH, heightOf, look, gearFor, compose, paths, svg, streakOf, nextGear, moodOf };
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
    const head = st.streak ? `连续记录 <b>${st.streak}</b> 天` : '今天开始记吧';
    const foot = [st.days ? `一共记了 ${st.days} 天` : '', st.next ? `再连续 ${st.next.days} 天拿${st.next.name}` : '头带、棒球帽、皇冠都拿到了'].filter(Boolean).join(' · ');
    pop.innerHTML = `<div class="buddy-pop-head">${head}</div><p class="buddy-say">${esc(st.say)}</p><p class="buddy-foot">${esc(foot)}</p>`;
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
    pop.classList.remove('hidden', 'pop-spring');
    void pop.offsetWidth;
    pop.classList.add('pop-spring');
  },

  /** 回答来了：小人跳一下、头上冒「!」、招手 */
  buddyBang() {
    const btn = document.getElementById('buddy');
    if (!btn) return;
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
    if (!opts.streaming) this._lastAnswer = { question, answer, at: Date.now(), plan: opts.plan, baseDate: opts.baseDate };
    const plan = !opts.streaming && opts.plan;
    let planDate = '';
    if (plan) {
      planDate = shiftDateString(opts.baseDate || getTodayDateString(), plan.dayOffset || 0);
      // 15 分钟内说「不要米饭换红薯」，大模型知道改的是哪份计划
      this._planOffer = { at: Date.now(), text: this.planText(plan) };
    }
    pop.dataset.mode = 'answer';
    pop.dataset.q = q;
    pop.dataset.level = 'none';
    const dayWord = (d) => (d === getTodayDateString() ? '今天' : d === shiftDateString(getTodayDateString(), 1) ? '明天' : `${+d.slice(5, 7)}月${+d.slice(8)}日`);
    const added = plan && (this.plans || []).some(x => x.date === planDate && x.from === this._lastAnswer.at);
    pop.innerHTML = `<div class="buddy-pop-head">${esc(q.length > 26 ? q.slice(0, 25) + '…' : q)}</div>` +
      `<p class="buddy-answer${opts.streaming && !opts.planning ? ' typing' : ''}">${esc(answer)}</p>` +
      (opts.streaming ? `<p class="buddy-wait${opts.planning ? '' : ' hidden'}">正在排成计划，好了能一键加上<span class="think-dots"><i></i><i></i><i></i></span></p>` : '') +
      (plan ? `<div class="buddy-acts"><button class="buddy-act" type="button" data-pa="edit">改一改</button>` +
        `<button class="buddy-act primary" type="button" data-pa="add"${added ? ' disabled' : ''}>${added ? '✓ 已加到' : '加到'}${dayWord(planDate)}</button></div>` +
        `<p class="buddy-tip hidden">按住下面的按钮说要改的地方，比如「不要米饭，换成红薯」「蛋白再多一点」</p>` : '') +
      (opts.streaming ? '' : '<button class="buddy-more" type="button">看看连续记录 ›</button>');
    const more = pop.querySelector('.buddy-more');
    if (more) more.addEventListener('click', (e) => { e.stopPropagation(); this.showBuddyPop(); });
    pop.querySelectorAll('[data-pa]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.dataset.pa === 'add') {
        const n = this.addPlans(planDate, Object.assign({}, plan, { from: this._lastAnswer.at }));
        b.disabled = true;
        b.textContent = `✓ 已加到${dayWord(planDate)}`;
        window.Haptics && window.Haptics.fire('success');
        window.Sound && window.Sound.play('success');
        this.showToast(`加了 ${n} 条计划，到时候做完点 ✓ 就记上`);
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

  /** 计划写成几行字（给大模型看「刚才给的计划」） */
  planText(plan) {
    return (plan.meals || []).map(m => `${m.mealType} ${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG || 0}`)
      .concat((plan.workouts || []).map(w => `训练 ${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : (w.weightKg > 0 ? w.weightKg + 'kg' : '自重') + ` ${w.sets}×${w.reps}`}`))
      .join('\n');
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
      this.retryPending(p.id);
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
    const close = () => { pop.classList.add('hidden'); clearInterval(this._thinkT); };
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
      if (a && Date.now() - a.at < 30 * 60 * 1000) this.showBuddyAnswer(a.question, a.answer, { again: true, plan: a.plan, baseDate: a.baseDate });
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
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.renderBuddy(); else this.buddyStop(); });
    this.buddyIdle();
    this.bindTour();
  },

  // ================= 新手教程：小人带着看三步 =================
  tourSteps() {
    const simple = this.isSimple();
    return [
      { pose: 'wave', target: () => document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text'),
        text: simple ? '嗨，我陪你记。按住下面这个按钮，说说今天吃了啥，松手就记好了。' : '嗨，我陪你记。按住下面这个按钮，一口气说完今天练了啥、吃了啥，松手就记好了。',
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
  }
});
