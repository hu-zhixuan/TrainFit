/**
 * 萌系 Q版小人（v6.0）：大头、大眼睛亮晶晶、软软的。两个角色：夏柚（女）、江叙（男）。
 * 矢量 SVG，一个部件一组（头发、脸、眼睛、嘴、胳膊、腿、马尾、呆毛），CSS 让它们动：眨眼、呼吸、呆毛和马尾晃、招手、蹦。
 * 姿势：lie 趴在输入栏上沿（只露头和搭着的胳膊）/ stand 站 / walk 走 / wave 招手 / stretch 举手欢呼 / flex 秀肌肉。
 * 表情：平静 开心 害羞 担心 不服 得意 惊讶 困 心动 闪亮。衣服、身材（普通 / 薄肌 / 腹肌）画在身上，站起来看得清。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  const CHARS = {
    xy: {
      name: '夏柚', sex: 'f',
      hair: { base: '#c99173', shade: '#a2694c', light: '#f3d2b6', line: '#6f3e2b' },
      eye: ['#6a2c12', '#e0893f', '#ffd889'], skin: '#fff0e4', skinS: '#f6d0bb', line: '#5b3426', blush: '#ff9fa8'
    },
    jx: {
      name: '江叙', sex: 'm',
      hair: { base: '#2c2a3a', shade: '#1b1a26', light: '#6f7aa8', line: '#14131c' },
      eye: ['#152448', '#3d6bc4', '#9cc4ff'], skin: '#fff0e4', skinS: '#f3cdb8', line: '#2a2633', blush: '#ffa6a6'
    }
  };

  // 表情：眼、嘴、眉、脸红、特效
  const FACES = {
    平静: { eyes: 'open', mouth: 'small', brow: 'calm' },
    开心: { eyes: 'happy', mouth: 'open', brow: 'calm' },
    害羞: { eyes: 'side', mouth: 'wavy', brow: 'soft', blush: 2 },
    担心: { eyes: 'open', mouth: 'flat', brow: 'worry', fx: 'sweat' },
    不服: { eyes: 'half', mouth: 'pout', brow: 'angry', fx: 'anger' },
    得意: { eyes: 'half', mouth: 'smirk', brow: 'calm' },
    惊讶: { eyes: 'wide', mouth: 'o', brow: 'up' },
    困: { eyes: 'closed', mouth: 'small', brow: 'soft', fx: 'zzz' },
    心动: { eyes: 'heart', mouth: 'cat', brow: 'soft', blush: 2, fx: 'heart' },
    闪亮: { eyes: 'star', mouth: 'open', brow: 'calm', fx: 'sparkle' }
  };

  let uid = 0;

  /** 一只眼睛（左眼；右眼 flip 镜像），中心 cx, cy */
  function eye(c, kind, cx, cy, flip, id) {
    const s = flip ? -1 : 1, X = (x) => cx + s * x;
    const line = c.line;
    if (kind === 'happy') return `<path d="M${X(-11)} ${cy + 3} Q${cx} ${cy - 11} ${X(11)} ${cy + 3}" fill="none" stroke="${line}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (kind === 'closed') return `<path d="M${X(-11)} ${cy} Q${cx} ${cy + 7} ${X(11)} ${cy}" fill="none" stroke="${line}" stroke-width="3.2" stroke-linecap="round"/>`;
    const big = kind === 'wide' ? 1.12 : 1;
    const rx = 12 * big, ry = 15 * big;
    const shape = `M${X(-13)} ${cy - 2} C${X(-13)} ${cy - 16} ${X(13)} ${cy - 16} ${X(13)} ${cy - 2} C${X(13)} ${cy + 14} ${X(-13)} ${cy + 15} ${X(-13)} ${cy - 2}Z`;
    const dx = kind === 'side' ? 3.5 : 0;
    const pupil = kind === 'heart'
      ? `<path d="M${X(dx)} ${cy + 6} l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4z" fill="#ff5a8a"/>`
      : kind === 'star' ? `<path d="M${X(dx)} ${cy - 7} l2 5 5 .5 -4 3.5 1.4 5 -4.4 -3 -4.4 3 1.4 -5 -4 -3.5 5 -.5z" fill="#fff8c8"/>`
        : `<ellipse cx="${X(dx)}" cy="${cy + 1}" rx="${5 * big}" ry="${7 * big}" fill="${c.eye[0]}"/>`;
    const lid = kind === 'half' ? `<path d="M${X(-15)} ${cy - 18} L${X(15)} ${cy - 18} L${X(15)} ${cy - 3} Q${cx} ${cy - 6} ${X(-15)} ${cy - 3}Z" fill="${c.skin}"/>` : '';
    const lash = kind === 'half'
      ? `<path d="M${X(-14)} ${cy - 3} Q${cx} ${cy - 7} ${X(14)} ${cy - 3}" fill="none" stroke="${line}" stroke-width="3.6" stroke-linecap="round"/>`
      : `<path d="M${X(-14)} ${cy - 1} C${X(-14)} ${cy - 16} ${X(12)} ${cy - 18} ${X(15)} ${cy - 6} L${X(18)} ${cy - 9}" fill="none" stroke="${line}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<g class="ch-eye">
      <path d="${shape}" fill="#fff"/>
      <clipPath id="e${id}${flip ? 'r' : 'l'}"><path d="${shape}"/></clipPath>
      <g clip-path="url(#e${id}${flip ? 'r' : 'l'})">
        <ellipse cx="${X(dx)}" cy="${cy + 1}" rx="${rx}" ry="${ry}" fill="url(#ir${id})"/>
        ${pupil}
        <ellipse cx="${X(dx - 4.5)}" cy="${cy - 5}" rx="${4.2 * big}" ry="${5.2 * big}" fill="#fff"/>
        <circle cx="${X(dx + 5)}" cy="${cy + 7}" r="2.2" fill="#fff" opacity=".95"/>
        <circle cx="${X(dx + 2)}" cy="${cy - 8}" r="1.1" fill="#fff"/>
        <ellipse cx="${X(dx)}" cy="${cy - 11}" rx="14" ry="5" fill="#000" opacity=".12"/>
        ${lid}
      </g>
      ${lash}
      <path d="M${X(-6)} ${cy + 13.5} Q${X(1)} ${cy + 15} ${X(7)} ${cy + 12.5}" fill="none" stroke="${line}" stroke-width="1.2" opacity=".55"/>
    </g>`;
  }

  function mouth(c, kind, x, y) {
    const st = `fill="none" stroke="${c.line}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
    switch (kind) {
      case 'open': return `<path d="M${x - 6} ${y - 1} Q${x} ${y - 1} ${x + 6} ${y - 1} Q${x + 5} ${y + 8} ${x} ${y + 8} Q${x - 5} ${y + 8} ${x - 6} ${y - 1}Z" fill="#c4505a"/><path d="M${x - 3} ${y + 5} Q${x} ${y + 7.5} ${x + 3} ${y + 5}" fill="#ff8f9a"/>`;
      case 'cat': return `<path d="M${x - 6} ${y} Q${x - 3} ${y + 4} ${x} ${y} Q${x + 3} ${y + 4} ${x + 6} ${y}" ${st}/>`;
      case 'wavy': return `<path d="M${x - 6} ${y + 1} q2 -2 4 0 t4 0 t4 0" ${st}/>`;
      case 'pout': return `<path d="M${x - 4} ${y + 2} Q${x} ${y - 2} ${x + 4} ${y + 2}" ${st}/>`;
      case 'smirk': return `<path d="M${x - 4} ${y + 1} Q${x + 2} ${y + 3} ${x + 6} ${y - 2}" ${st}/>`;
      case 'o': return `<ellipse cx="${x}" cy="${y + 2}" rx="3.4" ry="4.4" fill="#b64652"/>`;
      case 'flat': return `<path d="M${x - 4} ${y + 1} L${x + 4} ${y + 1}" ${st}/>`;
      default: return `<path d="M${x - 3.5} ${y} Q${x} ${y + 3} ${x + 3.5} ${y}" ${st}/>`;
    }
  }

  /** 眉毛：左边那条按「外侧 → 内侧」画，右边镜像 */
  function brows(c, kind, ex, ey, flip) {
    const s = flip ? -1 : 1, X = (x) => ex + s * x;
    const st = `fill="none" stroke="${c.hair.line}" stroke-width="2.4" stroke-linecap="round"`;
    const d = {
      calm: `M${X(-9)} ${ey} Q${X(0)} ${ey - 4} ${X(9)} ${ey - 1}`,
      soft: `M${X(-8)} ${ey} Q${X(0)} ${ey - 2.5} ${X(8)} ${ey}`,
      worry: `M${X(-9)} ${ey + 1} Q${X(0)} ${ey - 3} ${X(8)} ${ey - 6}`,
      angry: `M${X(-9)} ${ey - 5} L${X(9)} ${ey + 1}`,
      up: `M${X(-9)} ${ey - 3} Q${X(0)} ${ey - 8} ${X(9)} ${ey - 4}`
    }[kind];
    return d ? `<path d="${d}" ${st}/>` : '';
  }

  // ---------- 头发（夏柚：奶茶色长发高马尾 + 柚子发夹；江叙：黑发蓬松刘海 + 呆毛） ----------
  function hairBack(ch) {
    const h = ch.hair;
    if (ch.sex === 'f') return `
      <g class="ch-tail"><path d="M136 30 C170 20 196 44 192 82 C189 112 172 140 176 168 C160 152 150 128 152 102 C154 78 150 52 136 30Z" fill="${h.base}" stroke="${h.line}" stroke-width="2"/>
        <path d="M150 44 C172 46 182 66 180 90 C178 112 168 130 170 150" fill="none" stroke="${h.shade}" stroke-width="2.4"/>
        <path d="M160 50 Q176 60 178 76" fill="none" stroke="${h.light}" stroke-width="3.4" stroke-linecap="round" opacity=".8"/></g>
      <path d="M46 92 C36 120 40 150 52 170 C58 160 62 140 64 120 L136 120 C138 140 142 160 148 170 C160 150 164 120 154 92 Z" fill="${h.shade}" stroke="${h.line}" stroke-width="2"/>`;
    return `<path d="M46 92 C40 108 42 122 52 128 L58 112 L142 112 L148 128 C158 122 160 108 154 92 Z" fill="${h.shade}" stroke="${h.line}" stroke-width="2"/>`;
  }

  function hairFront(ch) {
    const h = ch.hair;
    if (ch.sex === 'f') return `
      <path d="M44 100 C34 64 56 26 100 22 C144 26 166 64 156 100
        C152 88 150 78 148 66 C142 74 136 78 128 80 C130 72 128 64 124 58 C118 68 108 74 98 76 C101 68 100 62 96 56
        C90 66 80 72 68 74 C72 68 72 62 70 58 C64 68 56 76 50 80 C48 86 46 92 44 100Z" fill="${h.base}" stroke="${h.line}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M48 92 C42 116 44 140 52 156 C55 146 56 132 57 118 C58 108 57 100 55 90Z" fill="${h.base}" stroke="${h.line}" stroke-width="2"/>
      <path d="M152 92 C158 116 156 140 148 156 C145 146 144 132 143 118 C142 108 143 100 145 90Z" fill="${h.base}" stroke="${h.line}" stroke-width="2"/>
      <path d="M62 50 Q78 34 100 32" fill="none" stroke="${h.light}" stroke-width="5" stroke-linecap="round" opacity=".9"/>
      <path d="M112 32 Q128 34 138 44" fill="none" stroke="${h.light}" stroke-width="4" stroke-linecap="round" opacity=".7"/>
      <path d="M96 56 Q100 44 112 36 M70 58 Q78 46 90 38 M124 58 Q130 50 138 46" fill="none" stroke="${h.shade}" stroke-width="1.8" opacity=".8"/>
      <g class="ch-ahoge"><path d="M100 24 C94 8 106 0 114 6 C108 6 104 12 106 24Z" fill="${h.base}" stroke="${h.line}" stroke-width="1.8"/></g>
      <g><circle cx="58" cy="60" r="8.5" fill="#ffb53d" stroke="#d9861a" stroke-width="1.6"/><circle cx="58" cy="60" r="5.6" fill="#ffe08a"/>
        <path d="M58 54.5 L58 65.5 M52.5 60 L63.5 60 M54 56 L62 64 M62 56 L54 64" stroke="#ffb53d" stroke-width="1"/>
        <path d="M63 52 Q70 46 74 50 Q68 54 63 52Z" fill="#3cc58f"/></g>
      <path d="M134 30 Q144 24 152 32 Q148 40 138 40 Q132 36 134 30Z" fill="#10b981" stroke="#0a7a56" stroke-width="1.4"/>`;
    return `
      <path d="M42 104 C30 66 52 22 100 20 C148 22 170 66 158 104
        C155 94 153 84 151 72 C146 80 140 84 132 86 C134 78 132 70 128 62 C124 74 116 80 104 84 C107 76 106 68 102 60
        C96 72 86 80 72 84 C76 76 76 70 74 62 C68 72 58 80 50 84 C47 90 44 96 42 104Z" fill="${h.base}" stroke="${h.line}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M45 96 C41 110 44 122 50 130 C52 120 54 110 55 100Z" fill="${h.base}" stroke="${h.line}" stroke-width="2"/>
      <path d="M155 96 C159 110 156 122 150 130 C148 120 146 110 145 100Z" fill="${h.base}" stroke="${h.line}" stroke-width="2"/>
      <path d="M60 52 Q76 34 98 30" fill="none" stroke="${h.light}" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      <path d="M110 30 Q128 32 140 44" fill="none" stroke="${h.light}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
      <path d="M102 60 Q106 46 118 38 M74 62 Q82 48 94 40 M128 62 Q134 54 142 50" fill="none" stroke="${h.shade}" stroke-width="1.8" opacity=".85"/>
      <g class="ch-ahoge"><path d="M96 22 C88 4 104 -4 112 4 C104 6 100 12 104 22Z" fill="${h.base}" stroke="${h.line}" stroke-width="1.8"/></g>`;
  }

  function head(ch, f, id) {
    const c = ch;
    const fx = f.fx;
    const blush = f.blush || (ch.sex === 'f' ? 1 : 0);
    return `<g class="ch-head">
      ${hairBack(ch)}
      <path d="M50 84 C50 52 72 36 100 36 C128 36 150 52 150 84 C150 112 132 130 100 132 C68 130 50 112 50 84Z" fill="${c.skin}" stroke="${c.line}" stroke-width="2.2"/>
      <path d="M54 70 Q100 88 146 70 L146 60 L54 60Z" fill="${c.skinS}" opacity=".7"/>
      ${blush ? `<g opacity="${blush === 2 ? 0.85 : 0.45}"><ellipse cx="68" cy="113" rx="10" ry="5.5" fill="${c.blush}"/><ellipse cx="132" cy="113" rx="10" ry="5.5" fill="${c.blush}"/></g>` : ''}
      ${blush === 2 ? `<path d="M62 111 l3 -4 M67 111 l3 -4 M72 111 l3 -4 M126 111 l3 -4 M131 111 l3 -4 M136 111 l3 -4" stroke="#e86d78" stroke-width="1.3"/>` : ''}
      <g class="ch-eyes">${eye(c, f.eyes, 77, 98, false, id)}${eye(c, f.eyes, 123, 98, true, id)}</g>
      ${mouth(c, f.mouth, 100, 120)}
      ${hairFront(ch)}
      <g opacity=".9">${brows(c, f.brow, 77, 79)}${brows(c, f.brow, 123, 79, true)}</g>
      ${fx === 'sweat' ? `<path d="M150 66 q6 10 0 14 q-6 -4 0 -14z" fill="#8fd0ff" stroke="#4a9bd8" stroke-width="1.2"/>` : ''}
      ${fx === 'anger' ? `<path d="M140 46 l4 5 M146 44 l-1 6 M150 50 l-5 2 M138 52 l5 0" stroke="#ff5a5a" stroke-width="2.6" stroke-linecap="round"/>` : ''}
    </g>`;
  }

  // ---------- 身子：衣服按角色，身材画在露出来的肚子上 ----------
  const OUTFIT = {
    xy: {
      varsity: { top: '#ffffff', trim: '#10b981', bottom: '#3b3f4f', shoe: '#ffffff' },
      navy: { top: '#2f3f73', trim: '#ffffff', bottom: '#2a2d39', shoe: '#ffffff' },
      green: { top: '#10b981', trim: '#ffffff', bottom: '#2a2d39', shoe: '#ffffff' },
      black: { top: '#2b2d36', trim: '#ff9fb2', bottom: '#2b2d36', shoe: '#ffffff' },
      tank: { top: '#ffffff', trim: '#ffb53d', bottom: '#3b3f4f', shoe: '#ffffff', tank: true },
      open: { top: '#ffffff', trim: '#10b981', bottom: '#3b3f4f', shoe: '#ffffff', open: true, bra: '#10b981' },
      bare: { top: '#10b981', trim: '#0a7a56', bottom: '#2b2d36', shoe: '#ffffff', bra: '#10b981' },
      shirt: { top: '#ffffff', trim: '#d9dde4', bottom: '#5b6b8c', shoe: '#ffffff', shirt: true },
      champ: { top: '#e3b13a', trim: '#2a2b33', bottom: '#2a2b33', shoe: '#ffffff' }
    },
    jx: {
      varsity: { top: '#2f3140', trim: '#f2f1ed', sleeve: '#f2f1ed', bottom: '#56607d', shoe: '#ffffff' },
      navy: { top: '#2b3d73', trim: '#f2f1ed', sleeve: '#f2f1ed', bottom: '#8b93a8', shoe: '#ffffff' },
      green: { top: '#0f8f66', trim: '#f2f1ed', sleeve: '#f2f1ed', bottom: '#56607d', shoe: '#ffffff' },
      black: { top: '#33343d', trim: '#6b6e7a', sleeve: '#33343d', bottom: '#56607d', shoe: '#ffffff' },
      tank: { top: '#3d4256', trim: '#6b6e7a', bottom: '#8b93a8', shoe: '#ffffff', tank: true },
      open: { top: '#2f3140', trim: '#f2f1ed', sleeve: '#f2f1ed', bottom: '#56607d', shoe: '#ffffff', open: true },
      bare: { top: null, trim: null, bottom: '#56607d', shoe: '#ffffff', bare: true },
      shirt: { top: '#ffffff', trim: '#d9dde4', sleeve: '#ffffff', bottom: '#2a2d39', shoe: '#2a2b33', shirt: true },
      champ: { top: '#e3b13a', trim: '#2a2b33', sleeve: '#2a2b33', bottom: '#56607d', shoe: '#ffffff' }
    }
  };

  /** 肚子上的线：普通只有肚脐，薄肌（女生马甲线）、腹肌 */
  function abs(ch, build, cx, top) {
    const st = `fill="none" stroke="${ch.skinS}" stroke-width="1.8" stroke-linecap="round"`;
    if (build === 'ripped' && ch.sex === 'm') return `<path d="M${cx} ${top + 2} L${cx} ${top + 30}" ${st}/>
      <path d="M${cx - 11} ${top + 2} Q${cx - 5} ${top + 6} ${cx - 1} ${top + 2} M${cx + 11} ${top + 2} Q${cx + 5} ${top + 6} ${cx + 1} ${top + 2}" ${st}/>
      <path d="M${cx - 8} ${top + 12} L${cx - 2} ${top + 12} M${cx + 2} ${top + 12} L${cx + 8} ${top + 12} M${cx - 8} ${top + 21} L${cx - 2} ${top + 21} M${cx + 2} ${top + 21} L${cx + 8} ${top + 21}" ${st}/>
      <path d="M${cx - 13} ${top + 14} Q${cx - 10} ${top + 26} ${cx - 4} ${top + 32} M${cx + 13} ${top + 14} Q${cx + 10} ${top + 26} ${cx + 4} ${top + 32}" ${st}/>`;
    if (build === 'ripped') return `<path d="M${cx - 6} ${top + 6} L${cx - 6} ${top + 24} M${cx + 6} ${top + 6} L${cx + 6} ${top + 24} M${cx} ${top + 8} L${cx} ${top + 20}" ${st}/><circle cx="${cx}" cy="${top + 27}" r="1.4" fill="${ch.skinS}"/>`;
    if (build === 'lean') return ch.sex === 'm'
      ? `<path d="M${cx - 11} ${top + 2} Q${cx - 5} ${top + 6} ${cx - 1} ${top + 2} M${cx + 11} ${top + 2} Q${cx + 5} ${top + 6} ${cx + 1} ${top + 2} M${cx} ${top + 8} L${cx} ${top + 22}" ${st}/><circle cx="${cx}" cy="${top + 27}" r="1.4" fill="${ch.skinS}"/>`
      : `<path d="M${cx - 6} ${top + 8} L${cx - 6} ${top + 22} M${cx + 6} ${top + 8} L${cx + 6} ${top + 22}" ${st}/><circle cx="${cx}" cy="${top + 26}" r="1.4" fill="${ch.skinS}"/>`;
    return `<circle cx="${cx}" cy="${top + 24}" r="1.5" fill="${ch.skinS}"/>`;
  }

  // 胳膊的姿势：[上臂角度, 小臂角度]，0 是垂下，越大越往外抬（右边自动镜像）；画在头前面，举起来不会被大头挡住
  const ARMS = {
    stand: [[14, 6], [14, 6]],
    walk: [[4, -6], [22, 30]],
    wave: [[14, 6], [100, 168]],
    stretch: [[122, 160], [122, 160]],
    flex: [[78, 168], [78, 168]],
    think: [[14, 6], [24, 212]]
  };

  /** 一只胳膊：肩膀 (sx, sy)，side -1 左 / 1 右；粗的线条画成胳膊（先描边再填色），拳头是个圆 */
  function arm(ch, sx, sy, side, a1, a2, sleeve, w, cls, bump) {
    const big = ch.sex === 'm' ? 1 : 0.88;
    const L1 = 29 * big, L2 = 21 * big;
    const dir = (deg) => { const r = deg * Math.PI / 180; return [side * Math.sin(r), Math.cos(r)]; };
    const d1 = dir(a1), d2 = dir(a2);
    const ex = sx + d1[0] * L1, ey = sy + d1[1] * L1;
    const hx = ex + d2[0] * L2, hy = ey + d2[1] * L2;
    const f = (n) => Math.round(n * 10) / 10;
    const path = `M${f(sx)} ${f(sy)} L${f(ex)} ${f(ey)} L${f(hx)} ${f(hy)}`;
    const fill = sleeve || ch.skin;
    // 秀肌肉：上臂朝上那边鼓一块（薄肌小、腹肌大），露着胳膊才看得见
    let muscleO = '', muscleF = '';
    if (bump) {
      const mx = sx + d1[0] * L1 * 0.55, my = sy + d1[1] * L1 * 0.55;
      const nx = -d1[1] * side, ny = d1[0] * side; // 上臂的法线，朝小臂折过去的那边
      const k = side * (nx * d2[0] + ny * d2[1]) > 0 ? 1 : -1;
      const bx = mx + nx * k * w * 0.55, by = my + ny * k * w * 0.55;
      muscleO = `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(w * bump + 2)}" fill="${ch.line}"/>`;
      muscleF = `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(w * bump)}" fill="${fill}"/>`;
    }
    const hand = `<circle cx="${f(hx + d2[0] * 3)}" cy="${f(hy + d2[1] * 3)}" r="${f(w + 0.6)}" fill="${ch.skin}" stroke="${ch.line}" stroke-width="2"/>`;
    return `<g class="${cls}" style="transform-origin:${f(sx)}px ${f(sy)}px">
      <path d="${path}" fill="none" stroke="${ch.line}" stroke-width="${f(w * 2 + 4)}" stroke-linecap="round" stroke-linejoin="round"/>
      ${muscleO}
      <path d="${path}" fill="none" stroke="${fill}" stroke-width="${f(w * 2)}" stroke-linecap="round" stroke-linejoin="round"/>
      ${muscleF}${sleeve && sleeve !== ch.skin ? `<path d="M${f(hx - d2[0] * 3 - d2[1] * w)} ${f(hy - d2[1] * 3 + d2[0] * w)} L${f(hx - d2[0] * 3 + d2[1] * w)} ${f(hy - d2[1] * 3 - d2[0] * w)}" stroke="${ch.line}" stroke-width="1.4" opacity=".5"/>` : ''}${hand}</g>`;
  }

  /** 身子（躯干、裤子 / 裙子、腿）和胳膊分开返回：胳膊要画在头前面 */
  function body(ch, o, pose, build) {
    const fit = (OUTFIT[o.char] || OUTFIT.xy)[o.outfit] || (OUTFIT[o.char] || OUTFIT.xy).varsity;
    const male = ch.sex === 'm';
    // 肩膀半宽、腰半宽、胳膊粗细：练出来了肩膀宽一点、腰收一点（倒三角）
    const sw = male ? { normal: 22, lean: 23, ripped: 26 }[build] : { normal: 19, lean: 19.5, ripped: 20.5 }[build];
    const ww = male ? { normal: 20, lean: 19, ripped: 18 }[build] : { normal: 17, lean: 16, ripped: 15.5 }[build];
    const aw = male ? { normal: 5.6, lean: 6, ripped: 7 }[build] : { normal: 4.8, lean: 5, ripped: 5.4 }[build];
    const top = 130, waist = 172;
    const skin = ch.skin, line = ch.line;
    const bareTop = fit.bare;
    const torso = `M${100 - sw} ${top + 7} Q${100 - sw} ${top} ${100 - sw + 8} ${top} L${100 + sw - 8} ${top} Q${100 + sw} ${top} ${100 + sw} ${top + 7} L${100 + ww} ${waist} L${100 - ww} ${waist}Z`;
    const skinTorso = `<path d="${torso}" fill="${skin}" stroke="${line}" stroke-width="2"/>`;
    let shirt = '';
    if (bareTop) {
      shirt = skinTorso + abs(ch, build, 100, top + 6);
    } else if (fit.bra && !fit.open) {
      // 运动内衣 + 露出的小肚子（马甲线）
      shirt = skinTorso + abs(ch, build, 100, top + 12) +
        `<path d="M${100 - sw} ${top + 7} Q${100 - sw} ${top} ${100 - sw + 8} ${top} L${100 + sw - 8} ${top} Q${100 + sw} ${top} ${100 + sw} ${top + 7} L${100 + sw - 1} ${top + 18} Q100 ${top + 21} ${100 - sw + 1} ${top + 18}Z" fill="${fit.bra}" stroke="${line}" stroke-width="2"/>`;
    } else if (fit.open) {
      const inner = fit.bra ? `<path d="M${100 - 10} ${top} L${100 + 10} ${top} L${100 + 11} ${top + 16} Q100 ${top + 19} ${100 - 11} ${top + 16}Z" fill="${fit.bra}"/>` : '';
      shirt = skinTorso + abs(ch, build, 100, top + (fit.bra ? 12 : 6)) + inner +
        `<path d="M${100 - sw} ${top + 7} Q${100 - sw} ${top} ${100 - sw + 8} ${top} L${100 - 9} ${top} L${100 - 13} ${waist} L${100 - ww} ${waist}Z" fill="${fit.top}" stroke="${line}" stroke-width="2"/>
         <path d="M${100 + sw} ${top + 7} Q${100 + sw} ${top} ${100 + sw - 8} ${top} L${100 + 9} ${top} L${100 + 13} ${waist} L${100 + ww} ${waist}Z" fill="${fit.top}" stroke="${line}" stroke-width="2"/>
         <path d="M${100 - 9.5} ${top + 1} L${100 - 13} ${waist - 1} M${100 + 9.5} ${top + 1} L${100 + 13} ${waist - 1}" stroke="${fit.trim}" stroke-width="2.4"/>`;
    } else {
      shirt = `<path d="${torso}" fill="${fit.top}" stroke="${line}" stroke-width="2"/>`;
      if (fit.tank) shirt += `<path d="M${100 - 10} ${top} Q100 ${top + 11} ${100 + 10} ${top}" fill="${skin}" stroke="${line}" stroke-width="1.6"/>`;
      else if (fit.shirt) shirt += `<path d="M${100 - 7} ${top} L100 ${top + 10} L${100 + 7} ${top}" fill="${skin}" stroke="${line}" stroke-width="1.6"/><path d="M100 ${top + 12} L100 ${waist}" stroke="${fit.trim}" stroke-width="1.5"/><circle cx="100" cy="${top + 20}" r="1.3" fill="${fit.trim}"/><circle cx="100" cy="${top + 30}" r="1.3" fill="${fit.trim}"/>`;
      else shirt += `<path d="M${100 - 8} ${top} L100 ${top + 8} L${100 + 8} ${top}" fill="${fit.trim}" stroke="${line}" stroke-width="1.6"/><path d="M100 ${top + 8} L100 ${waist}" stroke="${fit.trim}" stroke-width="1.6" opacity=".8"/>
        <path d="M${100 - ww} ${waist - 5} L${100 + ww} ${waist - 5}" stroke="${fit.trim}" stroke-width="2.6" opacity=".9"/>
        ${male ? `<path d="M${100 - 16} ${top + 13} l2 -3 h3 l2 3 v6 h-7z" fill="${fit.trim}"/>` : `<circle cx="${100 - 10}" cy="${top + 16}" r="3" fill="#ffb53d"/>`}`;
    }
    // 下身：江叙运动长裤，夏柚百褶短裙 + 白袜子
    const step = pose === 'walk' ? (o.frame ? 4 : -4) : 0;
    let lower, legs;
    if (male) {
      lower = `<path d="M${100 - ww} ${waist} L${100 + ww} ${waist} L${100 + ww + 1} ${waist + 14} L${100 - ww - 1} ${waist + 14}Z" fill="${fit.bottom}" stroke="${line}" stroke-width="2"/>`;
      const leg = (x, d) => `<path d="M${x - 7} ${waist + 10} L${x - 6 + d} ${waist + 34} L${x + 6 + d} ${waist + 34} L${x + 7} ${waist + 10}Z" fill="${fit.bottom}" stroke="${line}" stroke-width="2"/>
        <path d="M${x - 5 + d} ${waist + 31} L${x + 5 + d} ${waist + 31}" stroke="${fit.trim || '#fff'}" stroke-width="2" opacity=".6"/>
        <path d="M${x - 9 + d} ${waist + 33} Q${x - 9 + d} ${waist + 42} ${x + d} ${waist + 42} L${x + 8 + d} ${waist + 42} Q${x + 10 + d} ${waist + 36} ${x + 5 + d} ${waist + 33}Z" fill="${fit.shoe}" stroke="${line}" stroke-width="2"/>`;
      legs = `<g class="ch-legs">${leg(100 - 9, step)}${leg(100 + 9, -step)}</g>`;
    } else {
      lower = `<path d="M${100 - ww} ${waist - 2} L${100 + ww} ${waist - 2} L${100 + ww + 8} ${waist + 17} Q100 ${waist + 21} ${100 - ww - 8} ${waist + 17}Z" fill="${fit.bottom}" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M${100 - 9} ${waist} L${100 - 13} ${waist + 18} M100 ${waist} L100 ${waist + 19} M${100 + 9} ${waist} L${100 + 13} ${waist + 18}" stroke="${line}" stroke-width="1.2" opacity=".35"/>`;
      const leg = (x, d) => `<path d="M${x - 4.5} ${waist + 14} L${x - 4.5 + d} ${waist + 36} L${x + 4.5 + d} ${waist + 36} L${x + 4.5} ${waist + 14}Z" fill="${skin}" stroke="${line}" stroke-width="2"/>
        <path d="M${x - 4.5 + d * 0.6} ${waist + 25} L${x + 4.5 + d * 0.6} ${waist + 25} L${x + 4.5 + d} ${waist + 35} L${x - 4.5 + d} ${waist + 35}Z" fill="#fff" stroke="${line}" stroke-width="1.6"/>
        <path d="M${x - 8 + d} ${waist + 33} Q${x - 8 + d} ${waist + 42} ${x + d} ${waist + 42} L${x + 7 + d} ${waist + 42} Q${x + 9 + d} ${waist + 36} ${x + 4 + d} ${waist + 33}Z" fill="${fit.shoe}" stroke="${line}" stroke-width="2"/>`;
      legs = `<g class="ch-legs">${leg(100 - 8, step)}${leg(100 + 8, -step)}</g>`;
    }
    // 胳膊：姿势决定角度；没袖子就是皮肤，秀肌肉时练出来的鼓一块
    const sleeve = bareTop || fit.tank || (fit.bra && !fit.open) ? null : (fit.sleeve || fit.top);
    const ay = top + 6, ax = 100 - sw + 3, bx = 100 + sw - 3;
    const A = ARMS[pose] || ARMS.stand;
    const bump = !sleeve && pose === 'flex' ? { normal: 0.5, lean: 0.75, ripped: 1 }[build] : 0;
    const swap = pose === 'walk' && o.frame;
    const L = swap ? A[1] : A[0], R = swap ? A[0] : A[1];
    const arms = arm(ch, ax, ay, -1, L[0], L[1], sleeve, aw, 'ch-arm ch-arm-l', bump) +
      arm(ch, bx, ay, 1, R[0], R[1], sleeve, aw, 'ch-arm ch-arm-r' + (pose === 'wave' ? ' ch-wave' : ''), bump);
    return { back: `<g class="ch-body">${legs}${lower}${shirt}</g>`, arms: `<g class="ch-arms">${arms}</g>` };
  }

  /** 趴着：肩膀露在头后面，两只胳膊叠着搭在输入栏边上，手垫在下巴底下 */
  function lieParts(ch, o) {
    const fit = (OUTFIT[o.char] || OUTFIT.xy)[o.outfit] || (OUTFIT[o.char] || OUTFIT.xy).varsity;
    const bare = fit.bare || fit.tank || (fit.bra && !fit.open);
    const top = fit.bare ? ch.skin : fit.bra && !fit.open ? fit.bra : fit.top;
    const sleeve = bare ? ch.skin : (fit.sleeve || fit.top);
    const w = ch.sex === 'm' ? 7 : 6.2;
    const one = (x0, x1) => {
      const d = `M${x0} 150 L${x1} 143`;
      return `<path d="${d}" stroke="${ch.line}" stroke-width="${w * 2 + 4}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${sleeve}" stroke-width="${w * 2}" stroke-linecap="round" fill="none"/>`;
    };
    const back = `<path d="M38 152 Q40 128 100 126 Q160 128 162 152Z" fill="${top}" stroke="${ch.line}" stroke-width="2.2"/>`;
    const arms = `<g class="ch-lie-arms">${one(34, 84)}${one(166, 116)}
      <circle cx="90" cy="141" r="${w + 0.8}" fill="${ch.skin}" stroke="${ch.line}" stroke-width="2"/><circle cx="110" cy="141" r="${w + 0.8}" fill="${ch.skin}" stroke="${ch.line}" stroke-width="2"/></g>`;
    return { back, arms };
  }

  /** 连续记录拿到的装备、生日的派对帽：戴在头上 */
  function gearLayer(gear, ch) {
    const g = (gear || [])[0];
    if (g === 'band') return `<path d="M50 70 Q100 52 150 70 L150 78 Q100 60 50 78Z" fill="#10b981" stroke="#0a7a56" stroke-width="1.6"/><path d="M96 60 L104 60 L104 66 L96 66Z" fill="#fff"/>`;
    if (g === 'cap') return `<path d="M50 62 C52 30 76 18 100 18 C124 18 148 30 150 62 Z" fill="#10b981" stroke="#0a7a56" stroke-width="2"/>
      <path d="M44 62 Q100 50 160 62 Q170 66 168 70 Q100 58 44 70 Z" fill="#0a7a56"/><circle cx="100" cy="20" r="3.4" fill="#0a7a56"/><path d="M92 38 L108 38" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    if (g === 'crown') return `<path d="M76 30 L80 10 L92 22 L100 4 L108 22 L120 10 L124 30 Z" fill="#ffcf45" stroke="#c99520" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="20" r="2.6" fill="#ff5a8a"/>`;
    if (g === 'party') return `<path d="M84 26 L102 -6 L116 24 Z" fill="#ff8fb1" stroke="#d9587f" stroke-width="2" stroke-linejoin="round"/>
      <path d="M90 16 L108 10 M94 6 L104 4" stroke="#fff" stroke-width="2.4"/><circle cx="102" cy="-7" r="4" fill="#ffd84d"/>`;
    return '';
  }

  function fxLayer(kind) {
    if (kind === 'heart') return `<g class="ch-fx ch-fx-heart"><path d="M164 34 l-9 -9 a5.5 5.5 0 0 1 9 -6 a5.5 5.5 0 0 1 9 6z" fill="#ff5a8a"/></g>`;
    if (kind === 'zzz') return `<g class="ch-fx ch-fx-zzz"><text x="150" y="40" font-size="20" font-weight="700" fill="#9aa3b5">z</text><text x="164" y="24" font-size="14" font-weight="700" fill="#9aa3b5">z</text></g>`;
    if (kind === 'sparkle') return `<g class="ch-fx ch-fx-sparkle"><path d="M166 20 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ffd84d"/></g>`;
    if (kind === 'note') return `<g class="ch-fx ch-fx-note"><path d="M160 40 L160 22 L174 18 L174 36" fill="none" stroke="#9aa3b5" stroke-width="3"/><circle cx="157" cy="40" r="4" fill="#9aa3b5"/><circle cx="171" cy="36" r="4" fill="#9aa3b5"/></g>`;
    return '';
  }

  /**
   * @param o {char:'xy'|'jx', pose, face, mood, outfit, build, frame, w}
   *   face：表情名（FACES 的键）；没给按 mood（idle/sleepy/bad/ok/good/great/love）对应
   */
  function svg(o) {
    o = o || {};
    const ch = CHARS[o.char] || CHARS.xy;
    const MOOD_FACE = { idle: '平静', sleepy: '困', bad: '担心', ok: '平静', good: '开心', great: '闪亮', love: '心动' };
    const fname = FACES[o.face] ? o.face : MOOD_FACE[o.mood] || '平静';
    const f = FACES[fname];
    const fx = f.fx === 'sweat' || f.fx === 'anger' ? '' : f.fx || (o.mood === 'good' ? 'note' : '');
    const pose = ['lie', 'stand', 'walk', 'wave', 'stretch', 'flex', 'think'].includes(o.pose) ? o.pose : 'lie';
    const build = ['normal', 'lean', 'ripped'].includes(o.build) ? o.build : 'normal';
    const id = 'c' + (++uid);
    const lie = pose === 'lie';
    const oo = Object.assign({}, o, { char: CHARS[o.char] ? o.char : 'xy' });
    const bd = lie ? lieParts(ch, oo) : body(ch, oo, pose, build);
    const vb = lie ? '0 -6 200 158' : '0 -6 200 226';
    const w = o.w || (lie ? 76 : 76);
    const h = Math.round(w * (lie ? 158 : 226) / 200);
    const defs = `<defs><linearGradient id="ir${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ch.eye[0]}"/><stop offset=".55" stop-color="${ch.eye[1]}"/><stop offset="1" stop-color="${ch.eye[2]}"/></linearGradient></defs>`;
    return `<svg class="ch-svg pose-${pose} ch-${o.char || 'xy'}" viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${defs}
      <g class="ch-all">${bd.back}<g class="ch-headwrap">${head(ch, f, id)}${gearLayer(o.gear, ch)}</g>${bd.arms}${fxLayer(fx)}</g></svg>`;
  }

  const Chibi = { CHARS, FACES, OUTFIT, svg };
  TF.Chibi = Chibi;
  if (typeof module !== 'undefined' && module.exports) module.exports = Chibi;
})(typeof window !== 'undefined' ? window : globalThis);
