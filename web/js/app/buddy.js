/**
 * 像素小人（照着用户本人画的男生：黑色蓬松乱发、刘海压眼、黑色棒球服白袖子；女生：长直发、齐刘海、眼角一点眼线）。
 * 学 Claude Code 里趴在输入框上的小家伙：平时趴在底部输入栏上沿；弹出「记好了」提示条、录音面板、修改 / 分享面板时，
 * 跳到最上面那一层的上沿趴着。别的界面一点不动。
 *
 * 表情跟今天的健康度走：没记 → 发呆（夜里闭眼打 Z），不健康 → 冒汗，还行 → 平常，健康 → 哼歌，非常健康 → 戴墨镜。
 * 小动作：头发隔一会儿晃一下、眨眼、偶尔左右看一眼；隔半分钟左右自己站起来伸个懒腰、溜达两步；
 * 点一下站起来招手；按住说话时站起来听；记上一顿举手欢呼；Z 往上飘、音符一跳一跳。
 * 第一次用时由它带着看三步新手教程（tf_tour），设置里能再看一遍。
 * 连续记录的天数换装备：3 天头带，7 天棒球帽，30 天皇冠。点一下弹个气泡：亲密度、连续几天、今天怎么样、蛋白还差多少；
 * 长按摸摸头，连着戳三下有反应；练了一组就秀一下肌肉（亲密度、摸头这些在 bond.js）。
 * 设置 →「外观」（v5.6）：角色（v6.0 起男生是江叙、女生是夏柚，人设在 cast.js；也能选「不要·极简」）、发型（男：乱发 中分 背头 寸头；
 * 女：长直发 高马尾 短发 丸子头）、发色、肤色、衣服（有几件要亲密度到了才解锁）、身材（跟着我练 / 普通 / 薄肌 / 腹肌）。
 * 存在 profile.buddy 里，跟着备份走。
 * v6.0 多了几个表情和动作：笑眼 ^^、脸红、闹别扭冒「💢」、托腮想事（think）；趴着一起一伏地喘气、蹦一下、你打字时看输入框。
 *
 * 画法：趴着 24×17、站着 24×25 的像素图，一层层拼（见下面 compose），自动描一圈深色边（浅色背景上也看得清）；特效单独一层（好让它动）。
 * 输出 SVG，每种颜色一条 path，shape-rendering=crispEdges；动画全在 CSS 里。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  /*
   * 一层一层拼（v5.6）：身子（衣服 + 身材）→ 头（发型）→ 头发晃的那一帧 → 搭在肩上的长发 → 眼睛 → 装备 → 举起的手。
   * 身子用的是「部位」字母，最后按衣服换成颜色：
   *   J 衣服 n 领子 m 领子条纹 T 里面的 T 恤 C 胸口的字母  R 胳膊 r 胳膊暗部  Q 趴着时的肩膀  F 鞋  P 裤子 p 袜子
   * 颜色字母：S 皮肤 s 皮肤暗部 E 眼睛 / 眼线；H 头发 h 头发暗部 L 头发高光；J 衣服 j 衣服暗部 V 袖子 v 袖子暗部 U 里面那件；
   *   Y 白（鞋、帽子上的字）K 墨镜 k 墨镜反光；G 绿 g 深绿；A 金 a 金高光；B 汗 Z 睡觉 N 音符 X 闪光 I 爱心；O 描边
   * '.' 透明，','（只在装备里用）擦掉原来的像素。
   */

  // ---------- 发型：头 13 行（最后一行是下巴），眼睛那一行（第 10 行）由 CHARS 的 eyes 盖上 ----------
  const STYLES = {
    // 男生：照着用户本人画的，蓬松乱发、刘海压眼
    messy: {
      char: 'boy', label: '乱发',
      head: [
        '........................',
        '........HHHHHHHHH.......',
        '......HHHLLHHHHHHHH.....',
        '.....HHHLHHHHHHHHHHH....',
        '.....HHHHHHHHHHHHHLHH...',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHHhHHHhHHHHhHHHH..',
        '....HHHhSHhSSShSHhHHHH..',
        '.....HHssssssssssHHH....',
        '.....HHSSSSSSSSSSHH.....',
        '......HSSSSSSSSSSH......',
        '.......sSSSSSSSSs.......'
      ],
      frames: [['..........H.HH..H.......'], ['...........H.HH..H......']],
      lie12: '......H..........H......'
    },
    // 中分：两边的刘海往外分开，露出一点额头
    part: {
      char: 'boy', label: '中分',
      head: [
        '........................',
        '.........HHHHHH.........',
        '.......HHHHHHHHHH.......',
        '......HHLLHHHHLLHH......',
        '.....HHLHHHhhHHHLHH.....',
        '.....HHHHHHhhHHHHHH.....',
        '....HHHHHHHhhHHHHHHH....',
        '....HHHHHHHSSHHHHHHH....',
        '....HHHHHHSSSSHHHHHH....',
        '....HHHHssssssssHHHH....',
        '....HHHSSSSSSSSSSHHH....',
        '.....HHSSSSSSSSSSHH.....',
        '.......sSSSSSSSSs.......'
      ],
      frames: [['........................'], ['........................']],
      lie12: '.....HH..........HH.....'
    },
    // 背头：头发往后梳，额头全露出来，两边推短
    slick: {
      char: 'boy', label: '背头',
      head: [
        '........................',
        '.........HHHHHH.........',
        '.......HHHLLLLHHH.......',
        '......HHLLHHHHHHHH......',
        '.....HHLHHHHHHHHHHH.....',
        '.....HHHHHHHHHHHHHH.....',
        '.....hHHHHHHHHHHHHh.....',
        '.....hhHHHHHHHHHHhh.....',
        '......hhSSSSSSSSShh.....',
        '......hSSSSSSSSSSh......',
        '......hSSSSSSSSSSh......',
        '.......SSSSSSSSSS.......',
        '.......sSSSSSSSSs.......'
      ],
      frames: [['.........HH.............'], ['..........HH............']]
    },
    // 寸头：贴着头皮的一层
    buzz: {
      char: 'boy', label: '寸头',
      head: [
        '........................',
        '........................',
        '.........hhhhhhh........',
        '.......hhHHHHHHHhh......',
        '......hHHHLHHHHHHHh.....',
        '......HHHLHHHHHHHHH.....',
        '.....hHHHHHHHHHHHHHh....',
        '.....hHHHHHHHHHHHHHh....',
        '.....shSSSSSSSSSShs.....',
        '.....SsssssssssssSs.....',
        '.....sSSSSSSSSSSSSs.....',
        '......SSSSSSSSSSSS......',
        '.......sSSSSSSSSs.......'
      ],
      frames: [['........................'], ['........................']]
    },
    // 女生：长直发、齐刘海、头顶一根呆毛，长发搭在肩上
    long: {
      char: 'girl', label: '长直发',
      head: [
        '........................',
        '........HHHHHHHHH.......',
        '......HHHLLHHHHHHHH.....',
        '.....HHHLHHHHHHHHHHH....',
        '.....HHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHHHHHHHHHHHHHHHH..',
        '....HHHhHHHHhHHHHhHHHH..',
        '....HHhssssssssssHHHH...',
        '....HHSSSSSSSSSSSSHHH...',
        '....HHSSSSSSSSSSSSHHH...',
        '.......sSSSSSSSSs.......'
      ],
      frames: [['...........HH...........'], ['............HH..........']],
      drapeLie: ['....HHH..........HHH....', '....HHH..........HHH....', '...HHH...........HHH....', '....HH...........HH.....'],
      drapeStand: ['....HHH..........HHHH...', '....HHH..........HHH....', '....HH..........HHH.....', '.....H...........H......']
    },
    // 高马尾：额头露出来，马尾甩在右后边，一晃一晃
    pony: {
      char: 'girl', label: '高马尾',
      head: [
        '........................',
        '.........HHHHHHH........',
        '.......HHHHHHHHHHg......',
        '......HHHLLHHHHHHHg.....',
        '.....HHHLHHHHHHHHHH.....',
        '.....HHHHHHHHHHHHHH.....',
        '....HHHHHHHHHHHHHHH.....',
        '....HHHHHHHHHHHHHHH.....',
        '....HHHHHHHHHHSSShH.....',
        '....HHHhssssssssssH.....',
        '....HHSSSSSSSSSSSSH.....',
        '.....HSSSSSSSSSSSS......',
        '.......sSSSSSSSSs.......'
      ],
      frames: [
        ['........................', '..................HH....', '...................HHH..', '....................HHH.', '....................HHH.', '....................HHH.', '....................HHH.', '....................HH..', '.....................H..'],
        ['........................', '..................HH....', '...................HHH..', '....................HHH.', '.....................HHH', '.....................HHH', '.....................HHH', '.....................HH.', '......................H.']
      ]
    },
    // 短发：到下巴，圆圆的，齐刘海
    bob: {
      char: 'girl', label: '短发',
      head: [
        '........................',
        '.........HHHHHHH........',
        '.......HHHLLHHHHHH......',
        '......HHHLHHHHHHHHH.....',
        '.....HHHLHHHHHHHHHHH....',
        '.....HHHHHHHHHHHHHHH....',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHHHHHHHHHHHHHHH...',
        '....HHHhHHHhHHHhHHHHH...',
        '....HHhssssssssssHHHH...',
        '....HHSSSSSSSSSSSSHHH...',
        '....HHSSSSSSSSSSSSHHH...',
        '....hHHsSSSSSSSSsHHHh...'
      ],
      frames: [['........................'], ['........................']],
      lie12: '....hHH..........HHHh...'
    },
    // 丸子头：头顶扎一个团子，额头露出来，两边垂两缕
    bun: {
      char: 'girl', label: '丸子头',
      head: [
        '..........HHHH..........',
        '.........HLLHHH.........',
        '.........HHHHhH.........',
        '.......HHHhhhhHHH.......',
        '......HHHLHHHHHHHH......',
        '.....HHHLHHHHHHHHHH.....',
        '.....HHHHHHHHHHHHHH.....',
        '....HHHHHHHHHHHHHHHH....',
        '....HHhhSSShSSShhHHH....',
        '....HHsssssssssssHH.....',
        '....HHSSSSSSSSSSSSH.....',
        '.....HSSSSSSSSSSSSH.....',
        '.....H.sSSSSSSSSs.H.....'
      ],
      frames: [['........................'], ['........................']],
      lie12: '.....H............H.....'
    }
  };

  // ---------- 身子：趴着（第 12～16 行）和站着（第 13～20 行 + 腿 4 行） ----------
  const LIE_BODY = [
    '..QQ..............QQ....',
    '.QQQQQQrrrrrrrrrrQQQQQQ.',
    'RRRRRRRRRRRRRRRRRRRRRRRR',
    'rRRRRRRRRRRRRRRRRRRRRRRr',
    'rrrrrrrrrrrrrrrrrrrrrrrr'
  ];
  const STAND = {
    body: [
      '..........nmTmn.........',
      '.......RRJJnTnJJRR......',
      '......RRRJJJJJJJRRR.....',
      '......RRrJCCJJJJrRR.....',
      '......RRrJCCJJJJrRR.....',
      '......RRrJJJJJJJrRR.....',
      '......SS.JJJJJJJ.SS.....',
      '.........PPPPPPP........'
    ],
    wave: [
      '..........nmTmn.....SS..',
      '.......RRJJnTnJJR..RR...',
      '......RRRJJJJJJJRRRR....',
      '......RRrJCCJJJJJRR.....',
      '......RRrJCCJJJJJ.......',
      '......RRrJJJJJJJJ.......',
      '......SS.JJJJJJJJ.......',
      '.........PPPPPPP........'
    ],
    wave2: [
      '..........nmTmn......SS.',
      '.......RRJJnTnJJR...RR..',
      '......RRRJJJJJJJRRRRR...',
      '......RRrJCCJJJJJRR.....',
      '......RRrJCCJJJJJ.......',
      '......RRrJJJJJJJJ.......',
      '......SS.JJJJJJJJ.......',
      '.........PPPPPPP........'
    ],
    // 伸懒腰 / 欢呼：手举过头（ARMS_UP 盖上去）
    stretch: [
      '..........nmTmn.........',
      '........RJJnTnJJR.......',
      '........RJJJJJJJR.......',
      '.........JCCJJJJ........',
      '.........JCCJJJJ........',
      '.........JJJJJJJ........',
      '.........JJJJJJJ........',
      '.........PPPPPPP........'
    ]
  };
  // 秀肌肉：两只胳膊端起来（ARMS_FLEX 盖上去），身子和伸懒腰一样
  STAND.flex = STAND.stretch;
  const LEGS = {
    boy: { legs: ['.........PPP.PPP........', '.........PPP.PPP........', '.........PPP.PPP........', '........FFFF.FFFF.......'],
      walk: ['........PPP...PPP.......', '.......PPP.....PPP......', '.......PPP.....PPP......', '......FFFF.....FFFF.....'] },
    girl: { legs: ['.......PPPPPPPPPPP......', '.........SS...SS........', '.........pp...pp........', '........FFFF.FFFF.......'],
      walk: ['.......PPPPPPPPPPP......', '........SS.....SS.......', '.......pp.......pp......', '......FFFF.....FFFF.....'],
      waist: '........PPPPPPPPP.......' }
  };
  const ARMS_UP = { x: 5, y: 0, rows: ['SS............SS'].concat(Array(10).fill('RR............RR'), ['.R............R.']) };
  const ARMS_FLEX = {
    x: 0, y: 9, rows: [
      '.SSS.................SSS',
      '.SSS.................SSS',
      '.RRR.................RRR',
      '.RRR.................RRR',
      '.RRRR...............RRRR',
      '..RRRRRRR.......RRRRRRR.',
      '...RRRRRR.......RRRRRR..'
    ]
  };

  // 身材：盖在露出来的肚子上（只改皮肤的格子），左上角是胸口第一行最左边那格（站着 x=9、第 14 行）
  const BUILDS = {
    normal: { label: '普通', boy: ['.......', '.......', '.......', '.......', '...s...', '.......'], girl: ['.......', '.......', '.......', '.......', '...s...', '.......'] },
    lean: { label: '薄肌',
      boy: ['.......', '.ss.ss.', '...s...', '...s...', '...s...', '.......'],
      girl: ['.......', '.......', '.s...s.', '.s...s.', '.s...s.', '...s...'] },
    ripped: { label: '腹肌',
      boy: ['.......', '.ss.ss.', '...s...', '.sssss.', '...s...', '.sssss.'],
      girl: ['.......', '.......', '.s.s.s.', '.s.s.s.', '.s.s.s.', '...s...'],
      // 胳膊、肩膀粗一圈（男生）
      arms: { stand: [[6, 14], [5, 15], [5, 16], [18, 14], [19, 15], [19, 16]], flex: [[4, 12], [5, 12], [19, 12], [20, 12]], lie: [[1, 12], [4, 12], [17, 12], [22, 12]] } }
  };
  const BUILD_ORDER = ['normal', 'lean', 'ripped'];

  // 衣服类型：部位 → 颜色
  const TYPES = {
    jacket: { J: 'J', n: 'j', m: 'V', T: 'U', C: 'U', R: 'V', r: 'v', Q: 'J' },
    tank: { J: 'J', n: 'S', m: 'S', T: 'S', C: 'J', R: 'S', r: 's', Q: 'S' },
    open: { J: 'J', n: 'j', m: 'V', T: 'S', C: 'J', R: 'V', r: 'v', Q: 'J', open: [10, 14] },
    bare: { J: 'S', n: 'S', m: 'S', T: 'S', C: 'S', R: 'S', r: 's', Q: 'S' },
    shirt: { J: 'J', n: 'j', m: 'j', T: 'S', C: 'J', R: 'V', r: 'v', Q: 'J' }
  };

  // happy：笑眼 ^^（盖第 9、10 两行）；blush：脸红（眼睛下面一行，只涂两颊）
  const CHARS = {
    boy: { label: '男生', style: 'messy', eyeX: 7, eyes: { chill: 'SEESSSSEES', closed: 'SssSSSSssS', left: 'EESSSSEESS', right: 'SSEESSSSEE' },
      happy: ['.EE....EE.', 'ESSESSESSE'], blush: 'b........b' },
    girl: { label: '女生', style: 'long', eyeX: 6, eyes: { chill: 'ESEESSSSEESE', closed: 'ESssSSSSssSE', left: 'EEESSSSEESSE', right: 'ESSEESSSSEEE' },
      happy: ['..EE....EE..', 'SESSESSESSES'], blush: '.b........b.' }
  };
  // v6.0 两个人：男生是江叙、女生是夏柚（cast.js）；草稿里存过 jx / xy 的也认
  const CAST_CHAR = { jx: 'boy', xy: 'girl' };
  const EYE_Y = 10;
  const ART = {
    shades: { x: 6, y: 9, rows: ['KKKKKKKKKKKK', '.KkKK..KkKK.'] },
    gear: {
      band: { x: 4, y: 5, rows: ['GGGGGGGGGGGGGGGGG', 'GGGGGGGGGGYGGGGGGG'] },
      cap: {
        x: 3, y: 0, rows: [
          ',,,,,,,,,,,,,,,,,,',
          '.....GGGGGGGGG....',
          '...GGGGGGGGGGGGG..',
          '..GGGGGGGGGGGGGGG.',
          '..GGGGGGGGYGGGGGGG',
          '.GGGGGGGGGGGGGGGGG',
          'gggggggggggggggggggggg'
        ]
      },
      crown: { x: 9, y: -2, rows: ['A.AA.A', 'AaAAaA'] },
      // 生日那天戴的派对帽
      party: { x: 9, y: -4, rows: ['..X...', '..I...', '.IGI..', '.GIGI.', 'IGIGIG'] },
      // 今天练过：肩上搭条毛巾（v6.4，趴着搭在左肩上，站着挂在脖子上）
      towel: {
        lie: { x: 0, y: 11, rows: ['...YYY', '..YYY.', '.YYY..', 'YYY...', 'gYg...'] },
        stand: { x: 9, y: 13, rows: ['YY...YY', 'YY...YY', 'Yg...gY', 'YY...YY', 'g.....g'] }
      }
    },
    fx: {
      sweat: { x: 22, y: 7, rows: ['.B', 'BB', 'BB'] },
      zzz: { x: 20, y: -3, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
      note: { x: 20, y: -3, rows: ['.NNN', '.N.N', '.N..', 'NN..', 'NN..'] },
      sparkle: { x: 20, y: -3, rows: ['.X.', 'XXX', '.X.'] },
      heart: { x: 19, y: -3, rows: ['II.II', 'IIIII', '.III.', '..I..'] },
      anger: { x: 19, y: 0, rows: ['I.I', '.I.', 'I.I'] },
      // 吃撑了：脸边冒一团热气
      puff: { x: 20, y: 7, rows: ['..ZZ.', '.ZZZZ', 'ZZZZZ', '.ZZZ.', '.....', 'ZZ...'] }
    }
  };
  const AW = 24, AH = 17, AH_STAND = 25;
  const M = 3;                 // 四周留白（描边 + 特效）；底下不留：胳膊 / 鞋直接搭在下面那个框的边上
  const GW = AW + M * 2, GH = AH + M;
  const POSES = ['lie', 'stand', 'walk', 'wave', 'stretch', 'flex', 'think'];
  const heightOf = (pose) => (pose && pose !== 'lie' ? AH_STAND : AH) + M;

  const HAIR = {
    black: { label: '黑', H: '#3a2d27', h: '#221a16', L: '#5a4840' },
    brown: { label: '棕', H: '#6b4a32', h: '#4a3322', L: '#8c6647' },
    wine: { label: '酒红', H: '#6e2a33', h: '#4a1a22', L: '#934550' },
    ash: { label: '灰', H: '#7d7570', h: '#5b544f', L: '#a39a93' },
    blond: { label: '金', H: '#c9a04e', h: '#9c7a35', L: '#e2c077' },
    silver: { label: '银白', H: '#c8c6cf', h: '#9e9ba7', L: '#ebe9f0' }
  };
  const SKINS = {
    fair: { label: '白皙', S: '#f8dcc5', s: '#e8bea0', d: '#cf9f80' },
    natural: { label: '自然', S: '#f0c9a4', s: '#dcae8a', d: '#c08f6b' },
    tan: { label: '小麦', S: '#dba574', s: '#bf8657', d: '#9c6a42' },
    deep: { label: '深', S: '#a9714a', s: '#8a5837', d: '#6b4229' }
  };
  const WHITE = { V: '#f2f1ed', v: '#d4d3ce', U: '#f2f1ed' };
  // lv：和小人的亲密度到几级解锁（没有就是一开始就有）
  const OUTFITS = {
    varsity: Object.assign({ label: '黑白棒球服', type: 'jacket', J: '#363843', j: '#24252c' }, WHITE),
    navy: Object.assign({ label: '藏青棒球服', type: 'jacket', J: '#23315c', j: '#18213f' }, WHITE),
    green: Object.assign({ label: '绿白棒球服', type: 'jacket', J: '#0f8f66', j: '#0a6649' }, WHITE),
    black: { label: '全黑', type: 'jacket', J: '#2a2b32', j: '#1b1c21', V: '#454750', v: '#32343c', U: '#454750' },
    tank: { label: '运动背心', type: 'tank', J: '#2b2d35', j: '#1b1c21', V: '#2b2d35', v: '#1b1c21', U: '#2b2d35' },
    open: Object.assign({ label: '敞开的外套', type: 'open', J: '#363843', j: '#24252c', lv: 2 }, WHITE),
    bare: { label: '光膀子', girlLabel: '运动内衣', type: 'bare', J: '#2b2d35', j: '#1b1c21', V: '#2b2d35', v: '#1b1c21', U: '#2b2d35', lv: 3 },
    shirt: { label: '白衬衫', type: 'shirt', J: '#f4f4f1', j: '#c9ccd2', V: '#f4f4f1', v: '#d9dbe0', U: '#f4f4f1', lv: 4 },
    champ: { label: '冠军外套', type: 'jacket', J: '#c99a33', j: '#94701f', V: '#24252c', v: '#17181c', U: '#24252c', lv: 5 }
  };
  const BASE_COLORS = {
    E: '#241a15', K: '#141519', k: '#5b6170',
    G: '#10b981', g: '#0a7a56', A: '#e7b53c', a: '#fbe08a', Y: '#f2f1ed',
    B: '#7cc4f5', Z: '#9aa3b5', N: '#9aa3b5', X: '#ffd84d', I: '#f2557a', O: '#17120f',
    P: '#2b2c33', p: '#1c1d22', b: '#ff8fa0'
  };
  const DEFAULT_LOOK = { show: true, hair: 'black', outfit: 'varsity', skin: 'natural', build: 'auto' };
  const BUILD_CHOICES = ['auto', 'normal', 'lean', 'ripped'];

  // 心情：没记 / 犯困 / 四档健康度；摸头时闭眼冒爱心、脸红；v6.0 健康时笑眼 ^^，害羞脸红、闹别扭冒「💢」
  const MOODS = {
    idle: { eyes: 'chill' },
    sleepy: { eyes: 'closed', fx: 'zzz' },
    bad: { eyes: 'chill', fx: 'sweat' },
    ok: { eyes: 'chill' },
    good: { eyes: 'happy', fx: 'note' },
    great: { eyes: 'happy', fx: 'sparkle', blush: true },
    love: { eyes: 'closed', fx: 'heart', blush: true },
    shy: { eyes: 'left', blush: true },
    pout: { eyes: 'right', fx: 'anger' },
    // 吃撑了（v6.4）：眯着眼、脸红、冒热气
    full: { eyes: 'content', fx: 'puff', blush: true }
  };
  // 大模型、剧情给的表情 → 心情
  const FACE_MOOD = { 开心: 'good', 害羞: 'shy', 担心: 'bad', 得意: 'great', 惊讶: 'ok', 不服: 'pout', 平静: 'ok', 心动: 'love', 困: 'sleepy', 闪亮: 'great', 撑: 'full' };
  const LEVEL_MOOD = ['bad', 'ok', 'good', 'great'];
  const GEAR_STEPS = [{ days: 3, gear: 'band', name: '头带' }, { days: 7, gear: 'cap', name: '棒球帽' }, { days: 30, gear: 'crown', name: '皇冠' }];

  /** 选过的样子 + 默认值；没选过角色就跟着性别；发型不是这个角色的就用这个角色默认的 */
  function look(opts, gender) {
    const l = Object.assign({}, DEFAULT_LOOK, opts || {});
    if (CAST_CHAR[l.char]) l.char = CAST_CHAR[l.char];
    if (!CHARS[l.char]) l.char = gender === 'female' ? 'girl' : 'boy';
    if (!STYLES[l.style] || STYLES[l.style].char !== l.char) l.style = CHARS[l.char].style;
    if (!HAIR[l.hair]) l.hair = DEFAULT_LOOK.hair;
    if (!OUTFITS[l.outfit]) l.outfit = DEFAULT_LOOK.outfit;
    if (!SKINS[l.skin]) l.skin = DEFAULT_LOOK.skin;
    if (!BUILD_CHOICES.includes(l.build)) l.build = DEFAULT_LOOK.build;
    return l;
  }

  /** 「跟着我练」：最近 4 周练了几天 → 身材（练 4 天薄肌，10 天腹肌） */
  function buildFor(trainDays) {
    return trainDays >= 10 ? 'ripped' : trainDays >= 4 ? 'lean' : 'normal';
  }

  /** 连续记录的天数 → 戴什么（只戴最好的那一样） */
  function gearFor(streak) {
    const s = GEAR_STEPS.filter(x => streak >= x.days).pop();
    return s ? [s.gear] : [];
  }

  /**
   * 拼出一帧像素图（不含特效）。
   * @param {{char, style, hair, skin, outfit, build, mood, gear:string[], pose?:string, frame:0|1, eyes?:string}} o
   *   pose：lie 趴着（默认）/ stand 站着 / walk 走路 / wave 站着招手 / stretch 伸懒腰（举手欢呼）/ flex 秀肌肉
   *   build：normal / lean / ripped（「跟着我练」由调用的人先换算好；没给就是普通）
   * @returns {{ w, h, px: string[][], colors: Object }}  px[y][x] 是颜色代码，'.' 透明
   */
  function compose(o) {
    o = o || {};
    const l = look(o);
    const ch = CHARS[l.char];
    const st = STYLES[l.style];
    const mood = MOODS[o.mood] || MOODS[FACE_MOOD[o.face]] || MOODS.idle;
    const pose = POSES.includes(o.pose) ? o.pose : 'lie';
    const lie = pose === 'lie';
    const build = BUILDS[o.build] ? o.build : 'normal';
    const outfit = OUTFITS[l.outfit];
    const type = TYPES[outfit.type];
    const H = heightOf(pose);
    const px = Array.from({ length: H }, () => Array(GW).fill('.'));
    const put = (x, y, rows) => rows.forEach((r, dy) => [...r].forEach((c, dx) => {
      const X = x + dx + M, Y = y + dy + M;
      if (c === '.' || Y < 0 || Y >= H || X < 0 || X >= GW) return;
      px[Y][X] = c === ',' ? '.' : c;
    }));
    // 身子
    if (lie) put(0, 12, LIE_BODY);
    else {
      const body = pose === 'wave' ? (o.frame ? STAND.wave2 : STAND.wave) : STAND[pose] || STAND.body;
      put(0, 13, body);
      if (l.char === 'girl') put(0, 20, [LEGS.girl.waist]);
      put(0, 21, pose === 'walk' && o.frame ? LEGS[l.char].walk : LEGS[l.char].legs);
    }
    // 腹肌那一档：胳膊、肩膀粗一圈（男生）
    if (build === 'ripped' && l.char === 'boy') {
      const at = BUILDS.ripped.arms;
      const pts = lie ? at.lie : pose === 'flex' ? at.flex : pose === 'stand' || pose === 'walk' ? at.stand : [];
      pts.forEach(([x, y]) => put(x, y, [lie ? 'Q' : 'R']));
    }
    // 头、头发晃的那一帧、趴着时下巴旁边的鬓角
    put(0, 0, st.head);
    put(0, 0, st.frames[o.frame ? 1 : 0]);
    if (lie && st.lie12) put(0, 12, [st.lie12]);
    // 长发搭在肩上
    if (lie && st.drapeLie) put(0, 12, st.drapeLie);
    if (!lie && st.drapeStand) put(0, 12, st.drapeStand);
    // 托腮想事：眼睛往上看
    const eyes = o.eyes || (pose === 'think' && mood.eyes === 'chill' ? 'right' : mood.eyes);
    if (eyes === 'shades') put(ART.shades.x, ART.shades.y, ART.shades.rows);
    else if (eyes === 'happy') put(ch.eyeX, EYE_Y - 1, ch.happy);
    else if (eyes === 'content') put(ch.eyeX, EYE_Y - 1, [ch.happy[1], ch.happy[0]]); // ∪∪：吃饱了眯着眼
    else put(ch.eyeX, EYE_Y, [ch.eyes[eyes] || ch.eyes.chill]);
    if (mood.blush) put(ch.eyeX, EYE_Y + 1, [ch.blush]);
    (o.gear || []).forEach(k => { let g = ART.gear[k]; if (g && g.lie) g = lie ? g.lie : g.stand; if (g) put(g.x, g.y, g.rows); });
    if (pose === 'stretch') put(ARMS_UP.x, ARMS_UP.y, ARMS_UP.rows);
    if (pose === 'flex') put(ARMS_FLEX.x, ARMS_FLEX.y, ARMS_FLEX.rows);
    // 部位 → 颜色：敞开的外套中间露肚子；女生光着肚子是运动内衣（胸口两行是衣服）
    const torsoTop = 13 + M + 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < GW; x++) {
      const c = px[y][x];
      if (!(c in type)) continue;
      let to = type[c];
      if (!lie && c !== 'R' && c !== 'r' && y >= torsoTop && y < torsoTop + 6) {
        if (type.open && x - M >= type.open[0] && x - M <= type.open[1]) to = l.char === 'girl' && y < torsoTop + 2 ? 'j' : 'S';
        if (outfit.type === 'bare' && l.char === 'girl' && y < torsoTop + 2) to = 'J';
      }
      if (!lie && y === torsoTop - 1 && type.n === 'S') to = 's'; // 光膀子、背心：领口那一行是脖子的影子
      if (lie && to === 's') to = 'd';                         // 趴着露胳膊：下巴底下、胳膊边上深一点，别和脸连成一片
      px[y][x] = to;
    }
    // 身材：肚子露出来的地方画上线条
    if (!lie) {
      const pat = BUILDS[build][l.char];
      pat.forEach((r, dy) => [...r].forEach((c, dx) => {
        const X = 9 + dx + M, Y = torsoTop + dy;
        if (c !== '.' && px[Y] && px[Y][X] === 'S') px[Y][X] = c;
      }));
    }
    // 描边：透明格子挨着有颜色的格子就涂深色
    const filled = (x, y) => y >= 0 && y < H && x >= 0 && x < GW && px[y][x] !== '.' && px[y][x] !== 'O';
    for (let y = 0; y < H; y++) for (let x = 0; x < GW; x++) {
      if (px[y][x] === '.' && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) px[y][x] = 'O';
    }
    const hair = HAIR[l.hair], skin = SKINS[l.skin];
    const colors = Object.assign({}, BASE_COLORS, { H: hair.H, h: hair.h, L: hair.L, S: skin.S, s: skin.s, d: skin.d,
      J: outfit.J, j: outfit.j, V: outfit.V, v: outfit.v, U: outfit.U, F: BASE_COLORS.Y });
    return { w: GW, h: H, px, colors };
  }

  /** 特效单独一张（不描边），好让 CSS 让它飘、跳、闪 */
  function fxLayer(o, colors) {
    const mood = MOODS[o.mood] || MOODS[FACE_MOOD[o.face]] || MOODS.idle;
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
   *  站着的姿势（pose-stand / walk / wave / stretch / flex）只有两帧，CSS 按姿势决定换帧快慢（走路、招手换得快）。
   */
  function svg(o) {
    const pose = POSES.includes(o.pose) ? o.pose : 'lie';
    const frame = (extra) => compose(Object.assign({}, o, { pose }, extra));
    const a = frame({ frame: 0 });
    const H = a.h;
    const mood = MOODS[o.mood] || MOODS[FACE_MOOD[o.face]] || MOODS.idle;
    const scale = o.scale || 2;
    const eyeRow = (y) => y === EYE_Y + M;
    let eyesLayers = '';
    if ((o.eyes || mood.eyes) === 'chill' && pose !== 'think') {
      eyesLayers = `<g class="bd-blink">${paths(frame({ eyes: 'closed' }), eyeRow)}</g>` +
        `<g class="bd-lookl">${paths(frame({ eyes: 'left' }), eyeRow)}</g>` +
        `<g class="bd-lookr">${paths(frame({ eyes: 'right' }), eyeRow)}</g>`;
    }
    const fx = fxLayer(Object.assign({}, o, { pose }), a.colors);
    return `<svg class="buddy-svg pose-${pose}" viewBox="0 0 ${GW} ${H}" width="${GW * scale}" height="${H * scale}" shape-rendering="crispEdges" aria-hidden="true">` +
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

  /** 有记录的日子里，最长连着记了几天（拿到的装备一直留着，断了也不收回去：不搞断签惩罚） */
  function bestStreak(dates) {
    const days = [...new Set(dates)].sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => {
      const t = new Date(d + 'T12:00:00').getTime();
      run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
      prev = t;
      best = Math.max(best, run);
    });
    return best;
  }

  /** 离下一个装备还差几天：best 是拿到过的最长连续天数，streak 是现在连着几天 */
  function nextGear(best, streak) {
    if (streak == null) streak = best;
    const s = GEAR_STEPS.find(x => x.days > best);
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

  const Buddy = { CHARS, STYLES, HAIR, SKINS, ART, OUTFITS, TYPES, BUILDS, BUILD_ORDER, BUILD_CHOICES, DEFAULT_LOOK, MOODS, FACE_MOOD, LEVEL_MOOD, GEAR_STEPS, POSES, W: GW, H: GH, heightOf, look, buildFor, gearFor, compose, paths, svg, streakOf, bestStreak, nextGear, moodOf, liftOpts };
  TF.Buddy = Buddy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Buddy;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  buddyLook() {
    const l = TF.Buddy.look(this.profile.buddy, this.profile.gender);
    // 没解锁的衣服（数据删了、恢复了旧备份）先穿回默认的
    if (this.outfitOpen && TF.Buddy.OUTFITS[l.outfit].lv && !this.outfitOpen(l.outfit)) l.outfit = TF.Buddy.DEFAULT_LOOK.outfit;
    return l;
  },

  /** 有记录的日子（饮食、训练、体重都算） */
  recordDates() {
    return this.diet.map(d => d.date).concat(this.workouts.map(w => w.date), this.weights.map(w => w.date));
  },

  /** 小人：跟着今天的健康度和连续记录天数变 */
  renderBuddy() {
    const btn = document.getElementById('buddy');
    if (!btn) return;
    const look = this.buddyLook();
    const show = look.show && this.view === 'today' && !this.needsOnboarding; // 极简模式：教程也不叫它出来
    btn.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-buddy', show);
    if (!show) { this.buddyStop(); return; }
    const st = this.buddyState();
    this._buddySt = st;
    const moreFood = this._buddyCount != null && st.count > this._buddyCount;
    const moreLift = this._buddyLift != null && st.lifts > this._buddyLift;
    const rank = (g) => TF.Buddy.GEAR_STEPS.findIndex(x => x.gear === g[0]);
    const levelUp = this._buddyGear && rank(st.gear) > rank(this._buddyGear);
    const first = !btn.dataset.key;
    this.buddyDraw();
    if (levelUp) window.Sound && window.Sound.play('unlock', 0.6); // 连续记录拿到新装备：小琶音
    // 又记了一顿：站起来举手欢呼一下；练了：秀一下肌肉，跟你一起练
    if (!first && moreLift) this.buddyDo([['flex', 1000], ['stand', 250]]);
    else if (!first && (moreFood || levelUp)) this.buddyDo([['stretch', 750], ['stand', 250]]);
    if (!first && (moreFood || moreLift) && this.checkBond) { this.checkBond(); this.checkBuild(); }
    this._buddyCount = st.count;
    this._buddyLift = st.lifts;
    this._buddyGear = st.gear;
    btn.setAttribute('aria-label', `小人：${st.say}`);
    btn.classList.toggle('has-note', !!(this.noteReady && this.noteReady())); // 今天的小纸条还没拆：头上挂个小信封
    btn.classList.toggle('has-story', !!(this.storyCue && this.storyCue())); // TA 有话想跟你说（新的主线、约定达成的加篇）：头上冒一个「…」气泡（v8.0）
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
    const lifts = this.workouts.filter(w => w.date === today).length;
    const count = this.diet.filter(d => d.date === today).length + lifts;
    // 装备按拿到过的最长连续天数：断了也留着（v5.7，陪着你，不罚你）；生日那天戴派对帽
    const best = Math.max(streak, TF.Buddy.bestStreak(dates));
    const gear = this.isBirthday && this.isBirthday() ? ['party'] : TF.Buddy.gearFor(best);
    // 闹着小别扭：头上冒「💢」；道过晚安以后（22 点半起）它也睡了
    let mood = m.mood;
    let night = '';
    try { night = localStorage.getItem('tf_night') || ''; } catch (e) {}
    if (this.sulkNow && this.sulkNow()) mood = 'pout';
    else if (night === today && hour >= 22.5) mood = 'sleepy';
    else if (s.budget > 0 && s.intake > s.budget + 100) mood = 'full'; // 今天吃超了：撑着的样子（v6.4，跟着你的记录变）
    return { mood, say: m.say, level: g.hasData ? g.level : null, streak, best, days, gear, next: TF.Buddy.nextGear(best, streak), count, lifts };
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
    const day = this.dayLook ? this.dayLook() : { gear: [] }; // 今天练过：运动背心 + 毛巾（v6.4）
    const art = this.buddyArt(day.outfit ? { outfit: day.outfit } : null);
    const st = this._buddySt || this.buddyState();
    const gear = st.gear.concat(day.gear || []);
    const pose = this._pose || 'lie';
    // 一小会儿的表情：心情名（love 冒爱心）或者表情名（害羞、惊讶…）
    const over = this._moodOver;
    const face = over && TF.Buddy.FACE_MOOD[over] ? over : '';
    const mood = face ? st.mood : over || st.mood;
    const key = [art.char, art.style, art.hair, art.skin, art.outfit, art.build, mood, face, gear.join('+'), pose].join('|');
    if (btn.dataset.key === key) return;
    const posed = btn.dataset.pose !== pose;
    btn.dataset.key = key;
    btn.dataset.pose = pose;
    let move = btn.querySelector('.bd-move');
    if (!move) { btn.innerHTML = '<span class="bd-move"></span><span class="bd-mail" aria-hidden="true">✉</span><span class="bd-story" aria-hidden="true"><i></i><i></i><i></i></span>'; move = btn.querySelector('.bd-move'); }
    move.innerHTML = TF.Buddy.svg(Object.assign(art, { mood: face ? TF.Buddy.FACE_MOOD[face] : mood, gear, pose }));
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

  /** 自己动一动（v6.0 更勤）：隔十几二十秒，伸懒腰、溜达两步、招个手、托腮想事、蹦一下；趴着时 CSS 里一直在眨眼、呼吸、晃呆毛 */
  buddyIdle() {
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => this.buddyIdle(), 12000 + Math.random() * 18000);
    const btn = document.getElementById('buddy');
    const busy = document.getElementById('composer').classList.contains('recording') || document.getElementById('composer').classList.contains('busy');
    if (document.hidden || !btn || btn.classList.contains('hidden') || this._acting || this._touring || this._listening || busy ||
        this.reducedMotion() || String(btn.style.zIndex) !== '31' || !document.getElementById('buddy-pop').classList.contains('hidden')) return;
    const r = Math.random();
    if (r < 0.25) {
      this.buddyDo([['stand', 300], ['stretch', 1100], ['stand', 300]]);
    } else if (r < 0.55) {
      // 往左溜达几步，停下来左右看看，再走回来
      this.buddyDo([
        ['stand', 300],
        ['walk', 1500, () => this.buddyMove(-48, 1500)],
        ['stand', 900],
        ['walk', 1500, () => this.buddyMove(0, 1500)],
        ['stand', 250]
      ]);
    } else if (r < 0.7) {
      this.buddyDo([['stand', 200], ['wave', 1200], ['stand', 300]]);
    } else if (r < 0.82) {
      this.buddyDo([['think', 1800], ['stand', 300]]);
    } else if (this.buddyBuild && this.buddyBuild() !== 'normal' && r < 0.92) {
      this.buddyDo([['stand', 200], ['flex', 1000], ['stand', 300]]); // 练出来了，偶尔自己秀一下
    } else {
      this.buddyHop();
    }
  },

  /** 原地蹦一下（趴着也能蹦） */
  buddyHop() {
    const btn = document.getElementById('buddy');
    if (!btn || this.reducedMotion()) return;
    btn.classList.remove('hop');
    void btn.offsetWidth;
    btn.classList.add('hop');
    clearTimeout(this._hopT);
    this._hopT = setTimeout(() => btn.classList.remove('hop'), 600);
  },

  /** 你在打字、在翻：小人眼睛跟着看（往下看输入框 / 往上看你翻的东西），一会儿就回来 */
  buddyPeek(dir) {
    const btn = document.getElementById('buddy');
    if (!btn || btn.classList.contains('hidden')) return;
    btn.dataset.peek = dir;
    clearTimeout(this._peekT);
    this._peekT = setTimeout(() => { delete btn.dataset.peek; }, 1600);
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
    const name = this.callName ? this.callName() : '';
    const head = (name ? `${esc(name)}，` : '') + (st.streak ? `连续记录 <b>${st.streak}</b> 天` : '今天开始记吧');
    const foot = [st.days ? `一共记了 ${st.days} 天` : '', st.next ? `再连续 ${st.next.days} 天拿${st.next.name}` : '头带、棒球帽、皇冠都拿到了'].filter(Boolean).join(' · ');
    // 一句观察（最近一周蛋白够不够、吃没吃超）和一句训练建议，都是本机算的
    const obs = this.observation ? this.observation() : '';
    const tip = this.trainingTip ? this.trainingTip() : '';
    // 偶尔冒一句隐藏台词（熟了才有，8%）
    const today = getTodayDateString();
    this._tapCount = this._tapCount && this._tapCount.date === today ? { date: today, n: this._tapCount.n + 1 } : { date: today, n: 1 };
    // 闹着小别扭：先哼一声（长按摸摸头就和好）
    const sulk = this.sulkNow && this.sulkNow();
    const tap = sulk ? this.cast().sulkTap : null;
    const rare = sulk ? tap[Math.floor(Math.random() * tap.length)] + '（长按摸摸头哄哄）' : this.rareLine ? this.rareLine() : '';
    // v8.0：TA 有话想跟你说（新的主线 / 约定达成的加篇），最上面一行是 TA 自己的那句话（「……你醒了？我在泳池。」），点了就演
    const cue = this.storyCue ? this.storyCue() : null;
    const story = cue ? `<button class="buddy-story-row" type="button" data-${cue.kind}="${esc(cue.id)}"><span class="bsr-say">${esc(cue.line)}</span><small>${esc(cue.label)}</small><b>▶</b></button>` : '';
    pop.innerHTML = story + `<div class="buddy-pop-head">${head}</div>` + (rare ? `<p class="buddy-rare">${esc(rare)}</p>` : '') + this.bondRow() + `<p class="buddy-say">${esc(st.say)}</p>` +
      (obs ? `<p class="buddy-obs">${esc(obs)}</p>` : '') +
      (tip ? `<p class="buddy-train">${esc(tip)}</p>` : '') +
      (this.dexEntryHtml ? this.dexEntryHtml() : '') +
      `<p class="buddy-foot">${esc(foot)}</p>`;
    pop.querySelector('.buddy-dex').addEventListener('click', (e) => { e.stopPropagation(); this.openDex && this.openDex(); });
    const row = pop.querySelector('.buddy-story-row');
    if (row) row.addEventListener('click', (e) => { e.stopPropagation(); pop.classList.add('hidden'); if (row.dataset.bonus) this.playBonus(row.dataset.bonus); else this.playMain(row.dataset.main); });
    this.positionBuddyPop();
    pop.classList.remove('hidden');
  },

  /** 点小人看到的那一行亲密度：名字、第几章、离下一章还差几天、下一章是什么 */
  bondRow() {
    if (!this.bond) return '';
    const b = this.bond();
    const unlock = b.next && Object.keys(TF.Buddy.OUTFITS).find(k => TF.Buddy.OUTFITS[k].lv === b.next.lv);
    // 下一级解锁什么：一段回忆（给一句预告，让人想知道后面）+ 衣服
    const tease = b.next && this.cast().tease[b.next.lv - 1];
    // v7.0：亲密度就是剧情走到第几章
    const next = b.next ? `再记 ${Math.max(1, Math.ceil(b.next.need / 10))} 天左右进${this.chapterLabel(b.next.lv)}：${tease}${unlock ? `（解锁${this.outfitLabel(unlock)}）` : ''}` : '剧情都解锁了，TA 已经是最懂你的了';
    // v6.3：它现在的心情（有点想你 / 有点低落 / 担心你…），恋人线显示「恋人」
    const heart = this.heartLabel ? this.heartLabel() : '';
    const love = this.storyData && this.storyData().romance === true;
    return `<div class="bond-row"><div class="bond-top"><span class="bond-name"><i aria-hidden="true">♥</i>${esc(this.buddyName())} · ${esc(love ? '恋人' : b.name)}</span>` +
      `${heart ? `<span class="bond-heart">${esc(heart)}</span>` : ''}<span class="bond-lv">${esc(this.chapterLabel(b.lv).split(' · ')[0])}</span></div>` +
      `<div class="bond-bar"><i style="width:${Math.round(b.pct * 100)}%"></i></div><div class="bond-next">${esc(next)} · 长按我摸摸头</div></div>`;
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
  showBuddyThinking(question, kind) {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    clearInterval(this._thinkT);
    const q = String(question || '').replace(/\s+/g, ' ').trim();
    const eat = /吃|食谱|菜谱|蛋白|热量|碳水|饿/.test(q), lift = /练|训练|健身|动作/.test(q);
    // 聊天：不说「算算蛋白」这种干活的话，就是在听、在想怎么回你
    const steps = kind === 'chat' ? ['嗯…', '我在听', '想想怎么说…', '嗯，我想好了…'] : ['我想想…', '先看看你今天吃了多少…', eat ? '算算还差多少蛋白、还能吃多少…' : '翻翻你最近的训练…',
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
    if (!this._touring) { this.buddyStop(); this.buddyPose('think'); }
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
    if (!opts.streaming) this._lastAnswer = { question, answer, at: Date.now(), plan: opts.plan, baseDate: opts.baseDate, next: opts.next, chat: opts.chat };
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
        `<button class="buddy-act" type="button" data-pa="save">存起来</button>` +
        `<button class="buddy-act primary" type="button" data-pa="add"${added ? ' disabled' : ''}>${added ? '✓ 已加到' : '加到'}${where}</button></div>` +
        `<p class="buddy-tip hidden">按住下面的按钮说要改的地方，比如「不要米饭，换成红薯」「蛋白再多一点」</p>` : '') +
      (opts.streaming ? '' : this.nextChips(opts.next, opts.chat) + '<button class="buddy-more" type="button">看看连续记录 ›</button>');
    this.bindNextChips(pop);
    const more = pop.querySelector('.buddy-more');
    if (more) more.addEventListener('click', (e) => { e.stopPropagation(); this.showBuddyPop(); });
    pop.querySelectorAll('[data-pa]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.dataset.pa === 'add') {
        const from = this._lastAnswer.at;
        const n = days.reduce((t, d) => t + this.addPlans(d.date, Object.assign({}, d, { from }), true), 0);
        if (this.rememberPlan) this.rememberPlan(days); // 悄悄存一份：以后说「照上次那个练腿的计划」找得到（v6.5）
        this.saveData();
        if (this.bondGain) this.bondGain('plan');
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
      } else if (b.dataset.pa === 'save') {
        // 存进计划本（v6.5）：以后说「明天练练腿」就放到那天，不用再问一遍
        const entry = days.length > 1 ? { workouts: [], meals: [], days: days.map(d => ({ offset: Math.round((new Date(d.date + 'T00:00:00') - new Date(days[0].date + 'T00:00:00')) / 86400000), workouts: d.workouts, meals: d.meals })) }
          : { workouts: days[0].workouts, meals: days[0].meals };
        const e = this.savePlanBook && this.savePlanBook(entry, '');
        if (!e) return;
        this.saveData();
        b.disabled = true;
        b.textContent = '✓ 已存';
        window.Haptics && window.Haptics.fire('success');
        this.showToast(`存成「${e.name}」了，以后说「明天练${e.name}」就行`);
      } else {
        // 「改一改」：接下来说的那一句就是在改这份计划（v5.5，以前不做标记，「不要米饭换红薯」被当成记录，冒一张「没整理好」）
        this._planEdit = Date.now();
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
    if (!opts.streaming && !opts.again) {
      if (this.bondGain) this.bondGain('ask');
      // 记下刚才聊的：接着说「那换成牛肉呢」「嗯，有点累」时小人接得上（15 分钟内）
      if (this.pushTalk) this.pushTalk(q, plan ? this.planNotes(answer, days) || answer : answer);
      if (opts.face && this.buddyFace) this.buddyFace(opts.face);
    }
    // 聊天的回答一出来就带一点对话音
    if (fresh && opts.chat && !opts.again && window.Sound && window.Sound.babble) window.Sound.babble(String(answer || '').padEnd(14, '嗯'), this.cast().sex);
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
    if (first < shiftDateString(today, -13)) return false; // 用了两周以上
    let seen;
    try { seen = JSON.parse(localStorage.getItem('tf_tips') || '[]'); } catch (e) { seen = []; }
    if (!Array.isArray(seen)) seen = [];
    // 头两句趁热说，后面的一天最多教一样，别一下子塞太多
    let day = '';
    try { day = localStorage.getItem('tf_tips_day') || ''; } catch (e) {}
    if (seen.length >= 2 && day === today) return false;
    if (this.chatBudget && !this.chatBudget(false)) return false; // 今天说得够多了
    const n = this.diet.length + this.workouts.length;
    const simple = this.isSimple();
    let usedFix = false;
    try { usedFix = localStorage.getItem('tf_used_fix') === '1'; } catch (e) {}
    // 一样一样教，用过的就不教了
    const tips = [
      ['lift', (result.workouts || []).some(w => w.estimated && !w.durationMin), '下次带上几公斤、几组几个，我帮你算下次练多少。叫不出名字就描述一下，比如「坐着往前推的那个机器」。'],
      ['oneby', n <= 3, '吃完一顿说一句就行，不用攒到晚上一口气说完。说不准多少也没事，我会猜，猜不准会问你。'],
      ['fix', n >= 3 && !usedFix, '说错了不用点开改，再说一句「改成两碗」「删掉奶茶」就行。'],
      ['ask', n >= 4, simple ? '也可以问我，比如「晚上吃点啥」「今天还能吃多少」。' : '也可以问我，比如「晚上吃点啥」「明天练什么」。'],
      ['weight', n >= 5 && !this.weights.length, '称了体重也说一句「体重 62」，趋势图就有了。'],
      ['memo', n >= 6 && !this.memoList().length, '跟我说说你自己吧，比如「我叫阿程，健身新手，不吃辣」，我会记住，以后都照着来。'],
      ['plan', n >= 8 && !(this.plans || []).length, simple ? '想不好吃啥，说「给我排明天吃啥」，我按你的预算排。' : '想不好吃啥练啥，说「给我排明天的」，我按你的记录排。']
    ];
    const pick = tips.find(t => t[1] && !seen.includes(t[0]));
    if (!pick) return false;
    seen.push(pick[0]);
    try { localStorage.setItem('tf_tips', JSON.stringify(seen)); localStorage.setItem('tf_tips_day', today); } catch (e) {}
    if (this.chatBudget) this.chatBudget(true);
    const name = this.callName();
    this.sayTip((name ? name + '，' : '') + pick[2]);
    return true;
  },

  /** 小人主动说一句（新手提示、记完后的提醒）：冒「!」，招手，几秒后自己收起；next 是可以点的「接着问」，head 是上面一行小字（「悄悄话」） */
  sayTip(text, next, head) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return;
    pop.dataset.mode = 'tip';
    pop.dataset.level = 'none';
    pop.innerHTML = (head ? `<div class="buddy-pop-head whisper-head"><i aria-hidden="true">♥</i>${esc(head)}</div>` : '') + `<p class="buddy-say"></p>` + this.nextChips(next);
    this.bindNextChips(pop);
    this.typeOut(pop.querySelector('.buddy-say'), text);
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang(head ? '♥' : '!');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('tip'), 9000);
  },

  /**
   * 小人说的话一个字一个字打出来，配上对话音（v5.7，像游戏里角色在跟你说话）。
   * 没打出来的字先透明占着位置，气泡不会边打边变大；减少动态效果时直接显示、不出声。
   */
  typeOut(el, text) {
    if (!el) return;
    text = String(text || '');
    clearInterval(this._typeT);
    if (this.reducedMotion() || !text) { el.textContent = text; return; }
    window.Sound && window.Sound.babble && window.Sound.babble(text, this.cast ? this.cast().sex : 'm');
    const chars = [...text];
    let i = 0;
    const draw = () => { el.innerHTML = esc(chars.slice(0, i).join('')) + `<span class="type-ghost">${esc(chars.slice(i).join(''))}</span>`; };
    draw();
    this._typeT = setInterval(() => {
      i = Math.min(chars.length, i + 2);
      if (!el.isConnected) { clearInterval(this._typeT); return; }
      if (i >= chars.length) { clearInterval(this._typeT); el.textContent = text; return; }
      draw();
    }, 45);
  },

  /** 「接着问」：回答下面两句可以直接点的问题，点了就跟按住说出来一样 */
  /** chat：聊天时给的是「你可能回的话」（像游戏里的对话选项），点了接着聊 */
  nextChips(next, chat) {
    const list = (next || []).filter(Boolean).slice(0, 2);
    return list.length ? `<div class="buddy-next">${list.map(q => `<button class="next-chip${chat ? ' reply' : ''}" type="button" data-q="${esc(q)}"${chat ? ' data-chat="1"' : ''}>${esc(q)}</button>`).join('')}</div>` : '';
  },

  bindNextChips(pop) {
    const chips = [...pop.querySelectorAll('.next-chip')];
    chips.forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      // 点了一个：这个亮起来，其他的淡掉，都不能再点（点两下会发两遍、打断回答）
      chips.forEach(c => { c.disabled = true; c.classList.toggle('sent', c === b); });
      window.Haptics && window.Haptics.fire('tick');
      clearTimeout(this._askT);
      if (window.QuickLog) window.QuickLog.submit(b.dataset.q, b.dataset.chat ? { ask: true, chat: true } : { ask: true });
    }));
  },

  /**
   * 你说过有伤（小本本里「膝盖有旧伤」「腰不太好」）：练到那儿时提醒一句。记得你说过的话比什么功能都暖，
   * 也关系到安全，所以排在新手提示前面（v5.7）。每种一天一次，占 remind 的次数。
   */
  memoTip(result, batch) {
    const today = getTodayDateString();
    if (!batch || batch.date !== today || !(batch.workoutIds || []).length) return false;
    const memo = this.memoList ? this.memoList().join('；') : '';
    if (!/膝|腰|肩/.test(memo)) return false;
    let said;
    try { said = JSON.parse(localStorage.getItem('tf_coach') || '{}'); } catch (e) { said = {}; }
    if (said.date !== today || !Array.isArray(said.kinds)) said = { date: today, kinds: [] };
    const fire = (kind, text, next) => {
      if (said.kinds.includes(kind) || (this.voiceBudget && !this.voiceBudget('remind', true))) return false;
      said.kinds.push(kind);
      try { localStorage.setItem('tf_coach', JSON.stringify(said)); } catch (e) {}
      const name = this.callName();
      this.sayTip((name ? name + '，' : '') + text, next);
      return true;
    };
    for (const id of batch.workoutIds) {
      const w = this.workouts.find(x => x.id === id);
      if (!w || w.durationMin) continue;
      if (/膝/.test(memo) && (w.muscleGroup === '腿部' || /蹲|弓步|腿举|跳/.test(w.exerciseName))) {
        return fire('memo:knee', '你说过膝盖有旧伤，今天练腿悠着点，蹲别太低、别弹，疼就停。', ['膝盖不好怎么练腿']);
      }
      if (/腰/.test(memo) && /硬拉|划船|早安|山羊/.test(w.exerciseName)) {
        return fire('memo:back', '你说过腰不太好，硬拉、划船背挺直，重量别急着加。', ['腰不好怎么练背']);
      }
      if (/肩/.test(memo) && (w.muscleGroup === '肩部' || /推举|卧推|飞鸟/.test(w.exerciseName))) {
        return fire('memo:shoulder', '你说过肩膀不太好，推的时候别太宽、别锁死，疼就停。', ['肩不好怎么练胸']);
      }
    }
    return false;
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
      if (this.voiceBudget && !this.voiceBudget('remind', true)) return false; // 今天说得够多了
      said.kinds.push(kind);
      try { localStorage.setItem('tf_coach', JSON.stringify(said)); } catch (e) {}
      const name = this.callName();
      this.sayTip((name && !kind.startsWith('pr:') ? name + '，' : '') + text, next);
      return true;
    };
    // 破纪录、吃超了 v6.4 起是小人的反应（react.js 的 recordMoment），这里只管深夜和蛋白
    if (!(result.meals || []).length) return false;
    const s = this.getDaySummary(today);
    const hour = new Date().getHours();
    // 有点小脾气（熟了才这样）：这么晚还吃，闹个小别扭（v6.0：摸摸头或者明天好好吃饭就和好）；闹过了就嘴上嫌弃一句
    if ((hour >= 23 || hour < 4) && this.startSulk && !said.kinds.includes('late') && this.startSulk('late')) { said.kinds.push('late'); try { localStorage.setItem('tf_coach', JSON.stringify(said)); } catch (e) {} return true; }
    if (hour >= 22 && this.bond && this.bond().lv >= 3) return fire('late', '这么晚还吃……行吧，记上了。明天晚饭早点吃，别饿到这会儿。', ['晚上饿了吃点啥好']);
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
    const left = Math.round(target - s.protein);
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
        .concat(lifts.map(w => ({ tag: TF.workoutTag(w).label === '训练' ? '' : TF.workoutTag(w).label, name: w.exerciseName, tip: w.tip,
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
    const day = (d) => { const dt = shiftDateString(base || getTodayDateString(), d.dayOffset || 0); return `${+dt.slice(5, 7)}月${+dt.slice(8)}日`; };
    // 带上是哪天的：改完的计划还放在那天（以前一天的不写日期，改完偶尔跑到今天）
    if (!plan.days) return `${day(plan)}的：\n` + one(plan).join('\n');
    return plan.days.map(d => `${day(d)}：${one(d).join('；')}`).join('\n');
  },

  /**
   * 这句是不是在改刚给的计划：'edit' —— 点了「改一改」以后说的第一句（5 分钟内）；
   * 'maybe' —— 15 分钟内给过计划，说的是「不要米饭，换成红薯」「蛋白再多点」这种；'' —— 不是
   */
  planEditKind(text) {
    const offer = this._planOffer;
    const now = Date.now();
    if (!offer || now - offer.at > 15 * 60 * 1000) return '';
    if (this._planEdit && now - this._planEdit < 5 * 60 * 1000) { this._planEdit = 0; return 'edit'; }
    return TF.looksLikePlanEdit && TF.looksLikePlanEdit(text) ? 'maybe' : '';
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
      else if (window.QuickLog) window.QuickLog.submit(p.text, { ask: true, again: true }); // 点了「再试一次」：不算重复
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
    // 长按：摸摸头（v5.6）；连着戳三下：它有反应
    let holdT = null;
    const unhold = () => { clearTimeout(holdT); holdT = null; };
    btn.addEventListener('pointerdown', () => {
      unhold();
      this._patted = false; // 上次长按松手时小人换了图，click 可能没来：新的一下从头算
      if (this._touring) return;
      holdT = setTimeout(() => { holdT = null; this._patted = true; this.patBuddy && this.patBuddy(); }, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, unhold));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._patted) { this._patted = false; return; } // 刚摸完头，这一下不算点
      const now = Date.now();
      this._taps = (this._taps || []).filter(t => now - t < 1500).concat(now);
      if (this._taps.length >= 3 && !this._touring && this.pokeBuddy) { this._taps = []; this.pokeBuddy(); return; }
      window.Haptics && window.Haptics.fire('tick');
      window.Sound && window.Sound.play('blip');
      if (this._touring) { this.tourNext(); return; }
      this.buddyDo([['wave', 1800], ['stand', 400]]);
      document.getElementById('gauge-pop').classList.add('hidden');
      if (!pop.classList.contains('hidden')) { close(); return; }
      // 每天第一次点：先拆今天的小纸条
      if (this.noteReady && this.noteReady() && this.showNote()) return;
      // 半小时内问过问题：先给刚才的回答，里面能点去看连续记录
      const a = this._lastAnswer;
      if (a && Date.now() - a.at < 30 * 60 * 1000) this.showBuddyAnswer(a.question, a.answer, { again: true, plan: a.plan, baseDate: a.baseDate, next: a.next, chat: a.chat });
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
      if (document.hidden) { this.buddyStop(); this.markSeen && this.markSeen(); return; }
      this.renderBuddy();
      clearTimeout(this._greetT);
      this._greetT = setTimeout(() => this.greetOrGuide(), 1500);
    });
    // 打开 App：小人打个招呼（每天第一次）
    clearTimeout(this._greetT);
    this._greetT = setTimeout(() => this.greetOrGuide(), 2200);
    // 逛的时候（发呆、翻以前的日子、翻记录、看趋势）有时凑过来说一句
    this.watchBrowse && this.watchBrowse();
    this.buddyIdle();
    // 你在打字：小人低头看输入框；你在翻：抬头看你翻的东西
    const text = document.querySelector('.cmp-text');
    if (text) ['input', 'focus'].forEach(ev => text.addEventListener(ev, () => this.buddyPeek('down')));
    let lastPeek = 0;
    window.addEventListener('scroll', () => { const t = Date.now(); if (t - lastPeek > 400) { lastPeek = t; this.buddyPeek('up'); } }, { passive: true });
    this.bindTour();
  },

  // ================= 新手教程：小人带着看三步 =================
  tourSteps() {
    const simple = this.isSimple();
    const pal = this.buddyLook().show;
    const hi = pal ? '嗨，我陪你记。' : '';
    return [
      { pose: 'wave', target: () => document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text'),
        text: simple ? `${hi}按住下面这个按钮，说说今天吃了啥，松手就记好了。` : `${hi}按住下面这个按钮，说说练了啥、吃了啥，一句一句说、一大段一起说都行，松手就记好了。`,
        eg: simple ? '「早上包子豆浆，中午黄焖鸡」' : '「卧推80公斤4组8个，中午黄焖鸡」' },
      { pose: 'stand', target: () => document.getElementById('timeline'),
        text: '说错了不用改字，再说一句「改成一碗」「删掉奶茶」就行。点开一条也能改。' },
      { pose: 'stretch', target: () => document.getElementById('thermo'),
        text: '右上角这根温度计告诉你今天吃得健不健康。' + (pal ? '点我能看连续记了几天——连着记，我会换装备哦。' : '想要个搭子陪你记，设置 → 外观里叫 TA 出来。') }
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
      const bd = document.getElementById('buddy');
      // 极简模式没有小人：对话框放在输入栏上面
      const r = bd.classList.contains('hidden') ? document.getElementById('composer').getBoundingClientRect() : bd.getBoundingClientRect();
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
    // 看完教程还一条没记：接着带你记第一条
    setTimeout(() => this.firstGuide && this.firstGuide(true), 1200);
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
    if (!this.maybeCastPick || !this.maybeCastPick()) this.maybeTour(); // 老用户升级到 v6.0：先选谁陪你
  },

  /** 设置 →「外观」里的小人：谁陪你（江叙 / 夏柚 / 不要·极简）、预览（站着，看得见衣服和身材）、走到第几章、剧情（v7.0）、TA 的样子、TA 多黏你 */
  renderBuddySettings(pose) {
    const look = this.buddyLook();
    const $ = (id) => document.getElementById(id);
    if (!$('buddy-preview')) return;
    const st = this.buddyState();
    const B = TF.Buddy;
    const c = this.cast();
    document.querySelectorAll('#buddy-char .seg-btn').forEach(b => b.classList.toggle('active', look.show ? b.dataset.value === look.char : b.dataset.value === 'off'));
    $('buddy-on').classList.toggle('hidden', !look.show);
    if (!look.show) return;
    // 预览不戴连续记录的装备（帽子会把发型盖住），看得清头发和衣服
    $('buddy-preview').innerHTML = B.svg(this.buddyArt({ mood: pose === 'flex' ? 'great' : 'ok', gear: [], pose: pose || 'stand' }));
    $('buddy-blurb').textContent = c.blurb;
    $('buddy-style').innerHTML = Object.keys(B.STYLES).filter(k => B.STYLES[k].char === look.char)
      .map(k => `<button class="seg-btn${k === look.style ? ' active' : ''}" type="button" data-value="${k}">${B.STYLES[k].label}</button>`).join('');
    const sw = (group, list, cur, fill, locked) => {
      $(group).innerHTML = Object.keys(list).map(k => {
        const lock = locked && locked(k);
        const label = group === 'buddy-outfit' ? this.outfitLabel(k) : list[k].label;
        return `<button type="button" class="swatch${k === cur ? ' on' : ''}${lock ? ' locked' : ''}" data-value="${k}" aria-label="${label}${lock ? `（${this.chapterLabel(list[k].lv).split(' · ')[0]}解锁）` : ''}" title="${label}" style="${fill(list[k])}">${lock ? '<i aria-hidden="true">🔒</i>' : ''}</button>`;
      }).join('');
    };
    sw('buddy-hair', B.HAIR, look.hair, (h) => `background:${h.H}`);
    sw('buddy-skin', B.SKINS, look.skin, (k) => `background:${k.S}`);
    const fill = (o) => o.type === 'bare' ? `background:linear-gradient(90deg, ${B.SKINS[look.skin].S} 0 100%)` :
      o.type === 'tank' ? `background:linear-gradient(90deg, ${B.SKINS[look.skin].S} 0 26%, ${o.J} 26% 74%, ${B.SKINS[look.skin].S} 74%)` :
      o.type === 'open' ? `background:linear-gradient(90deg, ${o.V} 0 22%, ${o.J} 22% 40%, ${B.SKINS[look.skin].S} 40% 60%, ${o.J} 60% 78%, ${o.V} 78%)` :
      `background:linear-gradient(90deg, ${o.V} 0 30%, ${o.J} 30% 70%, ${o.V} 70%)`;
    sw('buddy-outfit', B.OUTFITS, look.outfit, fill, (k) => !this.outfitOpen(k));
    // v7.0：身材不用选了，跟着你练（最近 4 周练 4 天薄肌、10 天腹肌），只在露出来的衣服上看得出
    const n = this.trainDays28();
    const built = B.BUILDS[this.buddyBuild()].label;
    $('buddy-look-note').textContent = `衣服：${this.outfitLabel(look.outfit)}。身材跟着你练：最近 4 周练了 ${n} 天，现在是${built}` +
      (n < 10 ? `，练满 ${n < 4 ? 4 : 10} 天变${n < 4 ? '薄肌' : '腹肌'}` : '') + '（背心、敞开的外套、光膀子看得出来，点上面的 TA 秀一下）。';
    const b = this.bond();
    const rel = this.storyData ? this.storyData() : {};
    const lockNext = Object.keys(B.OUTFITS).filter(k => !this.outfitOpen(k)).map(k => B.OUTFITS[k].lv).sort()[0];
    // 亲密度 = 剧情走到第几章；下一章再记几天、解锁什么
    $('buddy-bond').innerHTML = `<div class="bond-top"><span class="bond-name"><i aria-hidden="true">♥</i>${esc(c.name)} · ${esc(rel.romance === true ? '恋人' : b.name)}</span><span class="bond-lv">${esc(this.chapterLabel(b.lv).split(' · ')[0])}</span></div>` +
      `<div class="bond-bar"><i style="width:${Math.round(b.pct * 100)}%"></i></div>` +
      `<div class="bond-next">${b.next ? `再记 ${Math.max(1, Math.ceil(b.next.need / 10))} 天左右进下一章${lockNext === b.next.lv ? '，解锁新衣服' : ''}` : '剧情都解锁了，衣服也是'}</div>`;
    // 剧情：五章，每章一个开头 + 几段小剧情，看过的点了重看
    this.renderStoryBook();
    const nb = (this.profile.buddy || {}).note || {};
    const total = Object.keys(c.events || {}).length;
    const mains = this.mainList ? this.mainList() : [];
    const mainGot = mains.filter(x => (rel.seen || []).includes(x.sc.id)).length;
    $('buddy-mem-note').textContent = (mains.length ? `主线 ${mainGot}/${mains.length} · ` : '') + `小剧情 ${(rel.seen || []).filter(id => (c.events || {})[id] && id !== 'confess').length}/${total - ((c.events || {}).confess ? 1 : 0)}` +
      (nb.n ? ` · 小纸条 ${nb.n} 张` : '');
    // 你们现在的关系；恋人可以改回搭子，选过搭子的可以让它再问一次
    const relName = rel.romance === true ? '恋人' : rel.romance === false ? '最好的搭子' : b.lv >= 3 ? '有点暧昧' : '';
    $('buddy-rel').innerHTML = relName || rel.romance != null ? `<span>你们现在：${esc(relName || b.name)}</span>` +
      (rel.romance != null ? `<button type="button" class="chip" data-rel-reset="1">${rel.romance ? '改回搭子' : '让 TA 再问一次'}</button>` : '') : '';
    const talk = this.talkLevel ? this.talkLevel() : 'normal';
    document.querySelectorAll('#buddy-talk .seg-btn').forEach(x => x.classList.toggle('active', x.dataset.value === talk));
    $('buddy-talk-note').textContent = talk === 'quiet' ? '记完只做个动作，破纪录、吃撑这种大事和剧情还会有；卡住了才开口' :
      talk === 'more' ? '再加上你逛的时候、发呆的时候凑过来聊几句、出个题，一天二十句以内' : '你记了什么 TA 都有反应，剧情照常走，打招呼、饭点问一句；你逛的时候不打扰';
    $('buddy-note').textContent = (st.streak ? `连续记录 ${st.streak} 天。` : '') + `${c.name}趴在「按住说话」上面：点一下看今天（每天第一次点有张小纸条），长按摸摸头，打字跟 TA 说「早」「晚安」「抱抱」TA 马上接。连续记 3 天戴头带，7 天棒球帽，30 天皇冠。`;
  },

  bindBuddySettings() {
    const set = (patch, pose) => {
      this.setBuddy(Object.assign(this.buddyLook(), patch));
      this.renderBuddySettings(pose);
      this.renderBuddy();
      window.Haptics && window.Haptics.fire('tick');
      if (pose) { clearTimeout(this._prevT); this._prevT = setTimeout(() => this.renderBuddySettings(), 1300); }
    };
    const pick = (id, key, pose) => document.getElementById(id).addEventListener('click', (e) => {
      const b = e.target.closest('.swatch, .seg-btn');
      if (!b) return;
      if (b.classList.contains('locked')) {
        const lv = TF.Buddy.OUTFITS[b.dataset.value].lv;
        this.showToast(`剧情走到${this.chapterLabel(lv)}解锁「${this.outfitLabel(b.dataset.value)}」，多记几天就到了`);
        return;
      }
      set({ [key]: b.dataset.value }, pose);
    });
    pick('buddy-hair', 'hair');
    pick('buddy-skin', 'skin');
    pick('buddy-outfit', 'outfit');
    pick('buddy-style', 'style');
    document.getElementById('buddy-char').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      if (b.dataset.value === 'off') set({ show: false, picked: 6 });
      else set(Object.assign({ char: b.dataset.value, show: true, picked: 6 }, b.dataset.value !== this.buddyLook().char ? { style: '' } : {}), 'wave');
    });
    document.getElementById('buddy-preview').addEventListener('click', () => {
      this.renderBuddySettings('flex');
      clearTimeout(this._prevT);
      this._prevT = setTimeout(() => this.renderBuddySettings(), 1300);
    });
    document.getElementById('buddy-rel').addEventListener('click', (e) => {
      if (!e.target.closest('[data-rel-reset]')) return;
      const love = this.storyData().romance === true;
      this.resetRelation();
      this.renderBuddySettings();
      this.showToast(love ? '改回搭子了。到了晚上，TA 也许还会再说一次那句话' : '好，过几天晚上 TA 会再问一次');
    });
    // 剧情：点主线（看过的重看、新的直接看），点看过的小剧情重看，点相册看大图，没解锁的告诉你怎么解锁
    document.getElementById('buddy-story').addEventListener('click', (e) => {
      const m = e.target.closest('[data-main]');
      const sc = e.target.closest('[data-scene]');
      const cg = e.target.closest('[data-cg]');
      if (m) { e.stopPropagation(); const seen = m.classList.contains('seen'); this.playMain(m.dataset.main, { replay: seen, after: () => this.renderBuddySettings() }); return; }
      const bo = e.target.closest('[data-bonus]');
      const dy = e.target.closest('[data-diary]');
      if (bo) { e.stopPropagation(); this.playBonus(bo.dataset.bonus, bo.classList.contains('seen')); return; }
      if (dy) { e.stopPropagation(); this.showDiary(+dy.dataset.diary); setTimeout(() => this.renderBuddySettings(), 300); return; }
      const pr = e.target.closest('.sb-promise[title]');
      if (pr) { this.showToast(pr.title); return; }
      if (sc) { e.stopPropagation(); this.showStoryEvent(sc.dataset.scene, true); return; }
      if (cg) { e.stopPropagation(); this.viewCg(cg.dataset.cg); return; }
      const hint = e.target.closest('.sb-scene');
      if (hint && hint.title) this.showToast(`解锁：${hint.title}`);
    });
    document.getElementById('buddy-talk').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (b && !b.disabled) set({ talk: b.dataset.value, chatty: b.dataset.value !== 'quiet' });
    });
  }
});
