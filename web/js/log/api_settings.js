/**
 * 设置页里的「AI 接口」和「语音识别」两张卡片：自定义接口地址、模型和 key，测试连接。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const { readOverride, writeOverride, readAsrOverride, writeAsrOverride, Native, LlmRoute, Parser, QuickLog } = TF;

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

    /**
     * 设置「AI 模型」（v12.7，用户：「不要太多选择，DeepSeek OK 就默认 DeepSeek；中间别叭叭叭说一堆中文；放个 DeepSeek 的 logo」
     * 「Base URL、模型 ID 像原来一样摆出来，挺专业」）：一行「现在在用」（logo + 名字 + 版本 + 这台手机上最近一句几秒），
     * 下面接口地址 / 模型 / Key 三栏，占位字写现在在用的那个的地址和模型 ID；填了 key 就先用你填的。不写说明文字。
     * 先用哪个由 `LlmRoute.order` 定，这里只显示，不让选。
     */
    lineName(id) {
      const info = LlmRoute && LlmRoute.info();
      const own = (readOverride() || {}).model;
      const model = id === 'main' ? (own || (info && info.main.model) || '') : ((info && info.backup && info.backup.model) || '');
      if (/atria/i.test(model)) return 'Atria';
      if (/deepseek/i.test(model)) return 'DeepSeek';
      if (model) return model.replace(/-(Preview|\d{4})$/i, '');
      return id === 'main' ? '主线路' : '备用';
    },

    /** 版本小字：deepseek-v4-flash-0731 → V4 Flash，Atria-Dawn-Preview → Dawn；自己填的写「自己填的 · 域名」 */
    lineModel(id) {
      const info = LlmRoute && LlmRoute.info();
      const o = readOverride() || {};
      const model = id === 'main' ? (o.model || (info && info.main.model) || '') : ((info && info.backup && info.backup.model) || '');
      if (id === 'main' && o.apiKey) { try { return '自己填的 · ' + new URL(o.baseUrl).host; } catch (e) { return '自己填的'; } }
      const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
      return model.replace(/^(deepseek|atria)-?/i, '').replace(/-(preview|\d{4})$/i, '').split('-').filter(Boolean).map(cap).join(' ');
    },

    // DeepSeek 的鲸鱼（官方标志，蓝 #4D6BFE；矢量取自 lobehub/lobe-icons，MIT）；别的模型用一颗通用的星
    LOGOS: {
      deepseek: '<svg viewBox="0 0 24 24"><path fill="#4D6BFE" d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"/></svg>',
      other: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 12l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>'
    },

    initRouteSettings() {
      const logo = document.getElementById('ai-logo');
      if (!logo || !LlmRoute) return;
      const sec = (ms) => (ms / 1000).toFixed(1) + ' 秒';
      const draw = () => {
        const o = readOverride();
        const first = LlmRoute.order(o)[0];
        const name = this.lineName(first);
        const ms = LlmRoute.median(first);
        logo.innerHTML = name === 'DeepSeek' ? this.LOGOS.deepseek : this.LOGOS.other;
        logo.classList.toggle('ds', name === 'DeepSeek');
        document.getElementById('ai-name').textContent = name;
        document.getElementById('ai-sub').textContent = [this.lineModel(first), ms && sec(ms)].filter(Boolean).join(' · ');
        // 三栏的占位字：现在在用的那条的地址和模型 ID
        const raw = Native.llmInfo();
        const line = raw && (first === 'backup' && raw.backup ? raw.backup : raw);
        const baseEl = document.getElementById('ql-cfg-base');
        const modelEl = document.getElementById('ql-cfg-model');
        const keyEl = document.getElementById('ql-cfg-key');
        if (baseEl) baseEl.placeholder = (line && line.baseUrl) || 'https://…/v1';
        if (modelEl) modelEl.placeholder = (line && line.model) || '模型名';
        if (keyEl) keyEl.placeholder = raw ? (line && line.hasKey ? '已内置，留空即可' : 'sk-…') : 'sk-…';
      };
      draw();
      this.refreshRouteNote = draw;
    },

    initSettings() {
      this.initAsrSettings();
      this.initRouteSettings();
      const baseEl = document.getElementById('ql-cfg-base');
      const modelEl = document.getElementById('ql-cfg-model');
      const keyEl = document.getElementById('ql-cfg-key');
      const saveBtn = document.getElementById('ql-cfg-save');
      const testBtn = document.getElementById('ql-cfg-test');
      if (!baseEl || !saveBtn) return;

      const o = readOverride();
      baseEl.value = o.baseUrl;
      modelEl.value = o.model;
      keyEl.value = o.apiKey;

      // 只填了 key、地址和模型空着：按占位字写的（现在在用的那个）存，看到什么就是什么
      const cfg = () => {
        const key = keyEl.value.trim();
        return { baseUrl: baseEl.value || (key && !baseEl.placeholder.includes('…') ? baseEl.placeholder : ''), model: modelEl.value || (key && modelEl.placeholder !== '模型名' ? modelEl.placeholder : ''), apiKey: keyEl.value };
      };
      saveBtn.addEventListener('click', () => {
        writeOverride(cfg());
        const o2 = readOverride();
        baseEl.value = o2.baseUrl; modelEl.value = o2.model;
        if (this.refreshRouteNote) this.refreshRouteNote();
        root.app && root.app.showToast('✓ AI 接口设置已保存');
      });

      testBtn.addEventListener('click', async () => {
        writeOverride(cfg());
        if (this.refreshRouteNote) this.refreshRouteNote();
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
