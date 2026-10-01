/**
 * 设置页里的「AI 接口」和「语音识别」两张卡片：自定义接口地址、模型和 key，测试连接。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const { readOverride, writeOverride, readAsrOverride, writeAsrOverride, Native, Parser, QuickLog } = TF;

  Object.assign(QuickLog, {
    // ----- 设置：AI 接口 -----
    initAsrSettings() {
      const baseEl = document.getElementById('asr-cfg-base');
      if (!baseEl) return;
      const modelEl = document.getElementById('asr-cfg-model');
      const keyEl = document.getElementById('asr-cfg-key');
      const hint = document.getElementById('asr-cfg-hint');
      const o = readAsrOverride();
      baseEl.value = o.baseUrl; modelEl.value = o.model; keyEl.value = o.apiKey;
      const info = Native.asrInfo();
      baseEl.placeholder = (info && info.baseUrl) || 'https://api.siliconflow.cn/v1';
      modelEl.placeholder = (info && info.model) || 'Qwen/Qwen3-ASR-1.7B';
      keyEl.placeholder = info && info.hasKey ? '已内置，留空即可' : 'sk-…';
      const refresh = () => {
        const now = Native.asrInfo() || info; // 云端上次成没成功会变，每次重新问
        const loc = now && now.local;
        const cloud = now && now.cloud;
        const cloudNote = !cloud ? '' : cloud === 'ok' ? '上次云端识别正常。'
          : /HTTP 402|Arrearage|FreeTierOnly|insufficient/i.test(cloud) ? '上次云端没认成：免费额度用完了或余额不足，用的是本机的结果。'
          : /HTTP 40[13]/.test(cloud) ? '上次云端没认成：key 不对或没有权限，用的是本机的结果。'
          : '上次云端没认成（网络不好或超时），用的是本机的结果。';
        const keyBad = /HTTP 40[123]|Arrearage|FreeTierOnly|insufficient/i.test(cloud || '') || !(now && now.hasKey);
        const howFree = !keyBad ? '' : '想让云端也免费用：去「千问 AI 平台」用手机号或支付宝登录（新用户送免费额度），在 API Key 页创建一个 sk-ws- 开头的 key，填到下面，地址和模型留空就行。';
        hint.textContent = Native.has()
          ? (loc === 'failed'
              ? '这台手机用不了本机识别（可能是 32 位系统），改用下面的云端接口。'
              : '说话时在手机本机识别（免费、不用联网），边说边出字；松手后联网就交给云端大模型再认一遍，更准，用不了就用本机的结果。' + cloudNote + howFree)
          : '浏览器里用的是浏览器自带的语音识别。';
      };
      refresh();
      this.refreshAsrHint = refresh;
      document.getElementById('asr-cfg-save').addEventListener('click', () => {
        writeAsrOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        refresh();
        if (this.canTalk() && this.mode === 'text') this.setMode('voice');
        root.app && root.app.showToast('✓ 语音识别设置已保存');
      });
    },

    initSettings() {
      this.initAsrSettings();
      const baseEl = document.getElementById('ql-cfg-base');
      const modelEl = document.getElementById('ql-cfg-model');
      const keyEl = document.getElementById('ql-cfg-key');
      const hint = document.getElementById('ql-cfg-hint');
      const saveBtn = document.getElementById('ql-cfg-save');
      const testBtn = document.getElementById('ql-cfg-test');
      if (!baseEl || !saveBtn) return;

      const o = readOverride();
      baseEl.value = o.baseUrl;
      modelEl.value = o.model;
      keyEl.value = o.apiKey;

      const info = Native.llmInfo();
      if (info) {
        baseEl.placeholder = info.baseUrl || 'https://…/v1';
        modelEl.placeholder = info.model || '模型名';
        keyEl.placeholder = info.hasKey ? '已内置，留空即可' : '还没有内置 key，请填写';
        hint.textContent = info.hasKey ? '安装包里已经带了接口配置，一般不用填。填了会覆盖内置的。' : '安装包里没有内置 key，填上才能用 AI 解析；不填就只能用简单规则。';
      } else {
        hint.textContent = '浏览器里调试用：填 OpenAI 兼容接口（部分服务商不允许浏览器跨域调用）。';
      }

      saveBtn.addEventListener('click', () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        root.app && root.app.showToast('✓ AI 接口设置已保存');
      });

      testBtn.addEventListener('click', async () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        testBtn.disabled = true;
        testBtn.textContent = '测试中…';
        try {
          const r = await Parser.viaLlm('卧推60公斤3组10个，中午吃了一碗牛肉面', { now: new Date(), history: [] });
          const n = r.workouts.length + r.meals.length;
          root.app && root.app.showToast(n ? `✓ 接口正常，识别出 ${n} 项` : '接口通了，但没识别出内容');
        } catch (e) {
          const msg = (e && e.message) || '';
          root.app && root.app.showToast(msg === 'NO_KEY' ? '还没有 API key' : ('✗ 连接失败：' + msg.slice(0, 60)));
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = '测试连接';
        }
      });
    }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
