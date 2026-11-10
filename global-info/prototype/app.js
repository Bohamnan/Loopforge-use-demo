/* 静态原型：对话式交互，全部为模拟数据，无后端调用。字段结构参照 global-info/简历模板.md
 * 流程：对话内上传 → 识别（思考过程）→ 逐项核对（点按钮或自然语言修改）→ 对话内确认提交 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // rows: [字段名, 值, 识别把握低?]
  function mockData() {
    return [
      { title: '基本信息', rows: [['姓名', '张伟'], ['手机号', '138****5678'], ['邮箱', 'zhangwei@example.com'], ['现居城市', '苏州'], ['出生年月', '1990-05'], ['工作年限', '8 年', true], ['最高学历', '硕士']] },
      { title: '求职意向', rows: [['意向岗位', '供应链经理'], ['期望城市', '苏州 / 上海'], ['期望薪资', '30–40K', true], ['到岗时间', '一个月内']] },
      { title: '工作经历', rows: [['公司', 'XX 泵业有限公司'], ['职位', '供应链主管'], ['时间', '2018.07 – 至今'], ['业绩', '主导供应商整合项目，采购成本降低 12%', true]] },
      { title: '项目经历', rows: [['项目', 'ERP 供应链模块上线'], ['时间', '2021.03 – 2021.12'], ['角色', '业务负责人'], ['成果', '订单交付周期缩短 18%']] },
      { title: '教育背景', rows: [['学校', 'XX 大学'], ['专业', '管理科学与工程'], ['学历', '硕士'], ['时间', '2015.09 – 2018.06', true]] },
      { title: '专业技能与证书', rows: [['技能', 'SAP、Excel 高级、供应链计划'], ['证书', 'CPIM（2020.06）'], ['语言', '英语 CET-6']] }
    ];
  }

  var S;
  function resetState() { S = { phase: 'idle', file: null, data: [], idx: 0, changed: {} }; }
  resetState();

  /* ---------- 消息渲染 ---------- */
  function scroll() { var s = $('stream'); s.scrollTop = s.scrollHeight; }
  function addMsg(who, html) {
    $('welcome').classList.add('hidden');
    var m = document.createElement('div');
    m.className = 'msg ' + who;
    m.innerHTML = '<div class="av"></div><div class="body">' + html + '</div>';
    $('thread').appendChild(m); scroll();
    return m;
  }
  function fileCard(f) {
    return '<div class="file-card"><div class="ft">' + esc(f.name.split('.').pop().toUpperCase()) + '</div><div>' + esc(f.name) + '<small>' + esc(f.size) + '</small></div></div>';
  }
  function addUser(text, file) {
    var h = (file ? fileCard(file) : '') + (text ? '<div class="txt">' + esc(text) + '</div>' : '');
    addMsg('user', h);
  }
  function addAI(html) { return addMsg('ai', '<div class="txt">' + html + '</div>'); }
  async function typing(ms) {
    var m = addMsg('ai', '<div class="dots"><span></span><span></span><span></span></div>');
    await sleep(ms || 600); m.remove();
  }
  function cardHtml(secs, withTitle) {
    return '<div class="rcard">' + secs.map(function (s) {
      return '<div class="sec"><div class="sec-h">' + esc(s.title) + '</div><div class="sec-b">' + s.rows.map(function (r) {
        var cls = r[2] ? 'flag' : (S.changed[s.title + r[0]] ? 'changed' : '');
        return '<div class="row"><label>' + esc(r[0]) + '</label><span class="' + cls + '">' + esc(r[1]) + '</span></div>';
      }).join('') + '</div></div>';
    }).join('') + '</div>';
  }
  // 快捷回复按钮：点击等同于用户发送该文字（保持“全程对话”）
  function quick(labels, primaryIdx) {
    return '<div class="quick">' + labels.map(function (l, i) {
      return '<button class="chip' + (i === primaryIdx ? ' primary' : '') + '" data-q="' + esc(l) + '">' + esc(l) + '</button>';
    }).join('') + '</div>';
  }
  $('thread').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return;
    var box = b.parentNode; box.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('disabled', ''); });
    handleUser(b.dataset.q);
  });

  /* ---------- 输入区 ---------- */
  var pending = null; // 已选择、待发送的文件
  function refreshSend() { $('send').disabled = !($('input').value.trim() || pending); }
  function setPending(f) {
    pending = f;
    var a = $('attach');
    if (!f) { a.classList.add('hidden'); a.innerHTML = ''; }
    else { a.classList.remove('hidden'); a.innerHTML = fileCard(f) + '';
      a.querySelector('.file-card').insertAdjacentHTML('beforeend', '<button class="rm" title="移除">×</button>');
      a.querySelector('.rm').onclick = function () { setPending(null); }; }
    refreshSend();
  }
  function fromFile(f) { return { name: f.name, size: (f.size / 1024 / 1024).toFixed(2) + ' MB' }; }
  $('clip').onclick = $('sgUpload').onclick = function () { $('file').click(); };
  $('file').onchange = function (e) { if (e.target.files[0]) setPending(fromFile(e.target.files[0])); e.target.value = ''; };
  var comp = $('composer');
  ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); comp.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); comp.classList.remove('drag'); }); });
  document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) setPending(fromFile(f)); });
  $('input').oninput = function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 160) + 'px'; refreshSend(); };
  $('input').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } };
  $('send').onclick = submit;
  $('sgSample').onclick = function () { setPending({ name: '张伟-简历.pdf', size: '0.86 MB' }); submit(); };

  function submit() {
    var text = $('input').value.trim(), f = pending;
    if (!text && !f) return;
    $('input').value = ''; $('input').style.height = 'auto'; setPending(null);
    if (f) { addUser(text, f); startParse(f); } else handleUser(text);
  }

  /* ---------- 1 上传 → 识别 ---------- */
  async function startParse(f) {
    var re = S.phase !== 'idle';
    resetState(); S.file = f; S.phase = 'parsing';
    var m = addAI('<details class="think" open><summary>正在识别…</summary><ul class="steps"></ul></details>');
    var steps = m.querySelector('.steps');
    var list = ['读取文件 ' + f.name, '提取文字内容', '按简历模型整理字段', '标记把握较低的内容'];
    for (var i = 0; i < list.length; i++) { await sleep(700); steps.insertAdjacentHTML('beforeend', '<li>' + esc(list[i]) + '</li>'); scroll(); }
    await sleep(500);
    var d = m.querySelector('details'); d.removeAttribute('open'); d.querySelector('summary').textContent = '已完成识别（用时 3.2 秒）';
    S.data = mockData(); S.idx = 0; S.phase = 'review';
    var low = S.data.reduce(function (n, s) { return n + s.rows.filter(function (r) { return r[2]; }).length; }, 0);
    m.querySelector('.body').insertAdjacentHTML('beforeend', '<div class="txt"><p>' + (re ? '已收到新文件，重新识别完成。' : '') +
      '识别完成，共整理出 <b>' + S.data.length + '</b> 部分内容，其中 <b>' + low + '</b> 处把握较低（黄色标记）。我们逐项核对，先从第 1 项开始。</p></div>');
    await askSection();
  }

  /* ---------- 2 逐项核对 ---------- */
  async function askSection() {
    var sec = S.data[S.idx];
    if (!sec) return askFinal();
    await typing(500);
    addAI('<p><b>第 ' + (S.idx + 1) + '/' + S.data.length + ' 项：' + esc(sec.title) + '</b></p>' + cardHtml([sec]) +
      '<p class="tip-line">无误请点「确认无误」；需要修改，直接告诉我，例如“工作年限改成 7 年”。</p>' + quick(['确认无误'], 0));
  }
  // 自然语言修改：在 “字段名 + (改成|改为|应为|是…) + 新值” 中解析
  function tryEdit(text) {
    var m = text.match(/(改成|改为|更正为|应为|应该是|修改为|是)\s*(.+)$/);
    var val = m ? m[2].trim() : null;
    for (var i = 0; i < S.data.length; i++) {
      for (var j = 0; j < S.data[i].rows.length; j++) {
        var r = S.data[i].rows[j];
        if (val && text.indexOf(r[0]) > -1) {
          var old = r[1]; r[1] = val; r[2] = false; S.changed[S.data[i].title + r[0]] = true;
          return { sec: i, label: r[0], old: old, val: val };
        }
      }
    }
    return null;
  }
  var OK_RE = /^(确认无误|确认|无误|没问题|没错|对|是的|正确|ok|好的?|下一项|继续)[。！!\s]*$/i;
  var ALL_RE = /(都|全部|其余|剩下).*(对|没问题|无误|确认)/;

  async function handleUser(text) {
    document.querySelectorAll('.quick .chip').forEach(function (c) { c.setAttribute('disabled', ''); });
    addUser(text);
    await routeText(text);
  }
  async function routeText(text) {
    if (S.phase === 'idle') { await typing(); return addAI('请先上传简历文件：点击输入框左下角的 📎，或直接把文件拖进来。'); }
    if (S.phase === 'parsing') { return addAI('正在识别中，请稍候…'); }
    if (S.phase === 'done') { await typing(); return addAI('这份简历已保存。需要提交另一份，请点击左侧「＋ 新对话」。'); }

    if (S.phase === 'review') {
      if (ALL_RE.test(text)) { S.idx = S.data.length; await typing(400); addAI('好的，其余内容已按“无误”处理。'); return askFinal(); }
      if (OK_RE.test(text)) { S.idx++; return askSection(); }
      var e = tryEdit(text); await typing(500);
      if (!e) return addAI('我没能理解要改哪一项。可以这样说：“<b>字段名</b> 改成 <b>新内容</b>”，例如“期望薪资改成 35–45K”。' + quick(['确认无误'], 0));
      var cur = S.data[S.idx];
      addAI('已更新「' + esc(S.data[e.sec].title) + '」的<b>' + esc(e.label) + '</b>：' + esc(e.old) + ' → <b>' + esc(e.val) + '</b>' +
        cardHtml([S.data[e.sec]]) + '<p class="tip-line">还有要改的吗？没有的话点「确认无误」继续' + (e.sec === S.idx ? '。' : '（当前核对：' + esc(cur.title) + '）。') + '</p>' + quick(['确认无误'], 0));
      return;
    }

    if (S.phase === 'final') {
      if (/(确认提交|提交|保存)/.test(text) && !/不|先别|修改/.test(text)) return doSave();
      if (/(还要修改|修改|改)/.test(text) && !tryEditPeek(text)) { await typing(); return addAI('好的，请直接告诉我要改什么，例如“手机号改成 139****1234”。改完我会再请你确认。'); }
      var e2 = tryEdit(text); await typing(500);
      if (!e2) return addAI('没能理解。请说“<b>字段名</b> 改成 <b>新内容</b>”，或回复“确认提交”。' + quick(['确认提交', '我还要修改'], 0));
      return addAI('已更新<b>' + esc(e2.label) + '</b>：' + esc(e2.old) + ' → <b>' + esc(e2.val) + '</b>。最新完整内容如下：' + cardHtml(S.data) +
        '<p class="tip-line">确认无误后提交。</p>' + quick(['确认提交', '我还要修改'], 0));
    }
  }
  function tryEditPeek(text) { return /(改成|改为|更正为|应为|应该是|修改为)/.test(text); }

  /* ---------- 3 确认提交 ---------- */
  async function askFinal() {
    S.phase = 'final'; await typing(600);
    addAI('<p>所有内容已核对完毕，以下是最终版本：</p>' + cardHtml(S.data) +
      '<p class="tip-line">提交后将保存：结构化简历记录 1 条 + 原始文件 <b>' + esc(S.file.name) + '</b>（二者自动关联）。请确认信息真实、准确。</p>' + quick(['确认提交', '我还要修改'], 0));
  }
  async function doSave() {
    S.phase = 'done'; await typing(900);
    addAI('<div class="saved"><b>✓ 简历已保存</b><div class="r"><span>记录编号</span>RS-20261110-0001</div><div class="r"><span>姓名</span>' +
      esc(S.data[0].rows[0][1]) + '</div><div class="r"><span>原始文件</span>' + esc(S.file.name) + '</div><div class="r"><span>保存时间</span>2026-11-10 15:30</div></div>' +
      '<p>已归档，无需重复提交。如需提交另一份，点击左侧「＋ 新对话」。</p>');
  }

  /* ---------- 新对话 / 评审快捷 ---------- */
  function reset() {
    resetState(); setPending(null);
    $('thread').innerHTML = ''; $('welcome').classList.remove('hidden');
  }
  $('newChat').onclick = $('pReset').onclick = reset;
  $('pSample').onclick = function () { reset(); setPending({ name: '张伟-简历.pdf', size: '0.86 MB' }); submit(); };
  $('pFinal').onclick = function () {
    reset(); S.file = { name: '张伟-简历.pdf', size: '0.86 MB' }; S.data = mockData();
    S.data.forEach(function (s) { s.rows.forEach(function (r) { r[2] = false; }); });
    addUser('', S.file); addAI('（原型快捷跳转）已识别并完成逐项核对。'); askFinal();
  };
})();
