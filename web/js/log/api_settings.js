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
        // 说明只写一句：内置了什么；云端的 key / 额度出问题才多说半句
        const keyBad = /HTTP 40[123]|Arrearage|FreeTierOnly|insufficient|InvalidApiKey|AccessDenied/i.test(cloud || '');
        hint.textContent = Native.has()
          ? '内置千问 Qwen-Audio-3.1 语音识别，按住说就行' + (loc === 'failed' ? '。' : '，没网时用手机本机识别。') + (keyBad ? '（云端暂时用不了：key 或额度有问题）' : '')
          : '浏览器里用的是浏览器自带的语音识别。';
      };
      // 本机识别模型（第一次打开时在后台下载）：进度、等 Wi-Fi、失败重试
      const mNote = document.getElementById('asr-model-note');
      const mRow = document.getElementById('asr-model-row');
      const mBtn = document.getElementById('asr-model-dl');
      let poll = null;
      const refreshModel = () => {
        const now = Native.asrInfo();
        const loc = now && now.local;
        const mb = now && now.dlTotal ? Math.round(now.dlTotal / 1e6) : 240;
        let text = '', btn = '';
        if (loc === 'missing') {
          const pct = now.dlTotal ? Math.floor(now.dlDone * 100 / now.dlTotal) : 0;
          if (now.dl === 'downloading') text = `离线识别模型下载中 ${pct}%`;
          else if (now.dl === 'failed') { text = '离线识别模型没下好'; btn = '重试'; }
          else { text = `离线识别模型（${mb}MB）连上 Wi-Fi 自动下载`; btn = '用流量下载'; }
        }
        mNote.textContent = text;
        mNote.classList.toggle('hidden', !text);
        mRow.classList.toggle('hidden', !btn);
        if (btn) mBtn.textContent = btn;
        clearTimeout(poll);
        if ((loc === 'missing' || loc === 'loading') && mNote.offsetParent !== null) poll = setTimeout(refreshModel, 1000);
      };
      mBtn.addEventListener('click', () => {
        try { root.TrainFitNative.downloadAsrModel(); } catch (e) {}
        setTimeout(refreshModel, 300);
      });
      refresh();
      refreshModel();
      this.refreshAsrHint = () => { refresh(); refreshModel(); };
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
