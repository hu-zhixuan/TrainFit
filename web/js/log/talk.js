/**
 * 常说的话手机自己接（v7.0，用户：「小人要有自己的性格和人格魅力，一开口就知道是这个人；不需要每句话都接入 AI，
 * 只有在特别的时候、用户主动进行关键对话时再接入 AI」）。
 *
 * 打招呼、早安晚安、谢谢、夸 TA、问 TA 在干嘛 / 吃了没 / 是谁、想你、喜欢你、抱抱、笨蛋、哈哈、好累…… 这些短句
 * 用角色自己的台词马上接（cast.js 的 talk，按亲密度、恋人线挑），又快又不会「很 AI」；说长了、说正事、在接着聊的，交给大模型。
 * 纯函数（node 能测）；app 那边是 app/chat.js 的 localTalk。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 整句认（去掉标点、语气词以后）；按顺序，先认得的先算
  const INTENTS = [
    ['night', /^(晚安|晚安啦|晚安安|我睡了|去睡了|睡了|我去睡了|睡觉了|先睡了)$/],
    ['morning', /^(早|早啊|早呀|早安|早上好|早早早|morning)$/i],
    ['back', /^(我回来了|回来了|我回来啦|回来啦|我又来了|我来了)$/],
    ['hi', /^(嗨|hi|hello|哈喽|你好|在吗|在不在|在嘛|喂|嘿|你在吗)$/i],
    ['thanks', /^(谢谢|谢谢你|谢啦|谢了|多谢|感谢|谢谢啦)$/],
    ['praise', /^(你真好|你好好|你真棒|你好厉害|你真厉害|你好帅|你真帅|你好可爱|你真可爱|你好好看|好帅|好可爱)$/],
    ['miss', /^(想你|想你了|我想你了|我想你|好想你|有点想你)$/],
    ['love', /^(喜欢你|我喜欢你|爱你|我爱你|好喜欢你|最喜欢你了|喜欢你哦)$/],
    ['hug', /^(抱抱|抱一下|要抱抱|抱我|求抱抱)$/],
    ['tease', /^(笨蛋|大笨蛋|傻瓜|哼|讨厌|讨厌你|坏蛋|你好笨)$/],
    ['laugh', /^(哈+|嘿嘿+|嘻嘻+|笑死|笑死我了|hhh+|233+|哈哈哈+)$/i],
    ['doing', /^(你在干嘛|你在干什么|你在做什么|你干嘛呢|在干嘛|干嘛呢|你在忙吗|你在忙什么)$/],
    ['ate', /^(你吃了吗|你吃饭了吗|你吃饭没|你吃了没|吃了吗)$/],
    ['who', /^(你是谁|你叫什么|你叫啥|你叫什么名字|你是谁啊)$/],
    ['age', /^(你几岁|你多大|你多大了|你几岁了)$/],
    ['like', /^(你喜欢什么|你喜欢吃什么|你有什么爱好|你喜欢干嘛)$/],
    ['bored', /^(好无聊|无聊|无聊死了|好闲|陪我玩)$/],
    ['tired', /^(好累|累|累死了|好累啊|累了|今天好累|好困|困死了|累死我了)$/]
  ];

  /** 这句是哪种常说的话（认不出返回 ''）。去掉标点再认；三个字以上的再去掉句尾的语气词试一次（「晚安啦」「在吗呀」） */
  function intent(text) {
    const raw = String(text || '');
    if (!raw.trim() || raw.length > 16) return '';
    const t = raw.trim().replace(/[\s,，。.!！?？~～…、]+/g, '');
    const t2 = t.length > 2 ? t.replace(/(啊|呀|呢|啦|哦|噢|嘛|吧)$/, '') : t;
    const hit = INTENTS.find(([, re]) => re.test(t) || re.test(t2));
    return hit ? hit[0] : '';
  }

  /**
   * 挑一句台词：talk[key] 是一串（随便挑一句）；miss / love 是按亲密度五级的；恋人线、好搭子说「喜欢你」另有。
   * o：{ lv, romance (true / false / undefined), name, used: [刚说过的], roll (0～1) }
   */
  function line(talk, key, o) {
    o = o || {};
    if (!talk || !talk[key]) return '';
    let list = talk[key];
    if (key === 'love' && o.romance === true && talk.loveRomance) list = talk.loveRomance;
    else if (key === 'love' && o.romance === false && talk.loveFriend) list = talk.loveFriend;
    else if (Array.isArray(list[0])) list = list[Math.max(0, Math.min(list.length - 1, (o.lv || 1) - 1))];
    const fresh = list.filter(x => !(o.used || []).includes(x));
    const pool = fresh.length ? fresh : list;
    const pick = pool[Math.floor((o.roll == null ? Math.random() : o.roll) * pool.length) % pool.length];
    return String(pick).replace(/\{name\}/g, o.name || '').replace(/^[。，！、～]+/, '');
  }

  TF.Talk = { INTENTS, intent, line };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Talk;
})(typeof window !== 'undefined' ? window : globalThis);
