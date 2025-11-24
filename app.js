/* ======================================================
   消費税法 暗記アプリ（同期機能廃止版 + カテゴリ別エクスポート）
   - Chart.js を用いてカテゴリごとの正答率を表示
   - 日別の正答/回答を localStorage にて保存（直近30日表示）
   - Cタブのカテゴリ選択に応じた部分エクスポート対応
   ====================================================== */
(() => {
  /* ===== LocalStorage Keys ===== */
  const LS_KEYS = {
    PROBLEMS: 'problems_v1',
    APPSTATE: 'app_state_v1',
    DAILYSTATS: 'daily_stats_v1',
    CATEGORY_STATS: 'category_stats_v1',
  };

  /* ===== 便利関数 ===== */
  const loadJSON = (k, fb) => { try{const v=localStorage.getItem(k); return v?JSON.parse(v):fb;}catch{ return fb; } };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const saveAll = () => {
    saveJSON(LS_KEYS.PROBLEMS, problems);
    saveJSON(LS_KEYS.APPSTATE, appState);
    saveJSON(LS_KEYS.DAILYSTATS, dailyStats);
    saveJSON(LS_KEYS.CATEGORY_STATS, categoryStats);
  };
  const uuid = ()=>'p-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  const todayKey = ()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const parseCategories=s=>s?String(s).split(',').map(x=>x.trim()).filter(Boolean):[];
  const extractAnswersFrom=el=>Array.from(el.querySelectorAll('.mask')).map(m=>(m.textContent||'').trim()).filter(Boolean);
  const unmaskAllIn=el=>el.querySelectorAll('.mask').forEach(m=>{ const p=m.parentNode; while(m.firstChild)p.insertBefore(m.firstChild,m); p.removeChild(m); });
  const firstSentenceFromHTML = (html)=>{ const d=document.createElement('div'); d.innerHTML=html; const t=(d.textContent||'').replace(/\s+/g,' ').trim(); if(!t) return '(空)'; const i=t.indexOf('。'); if(i>=0) return t.slice(0,Math.min(i+1,120)); return t.slice(0,100)+(t.length>100?'…':''); };
  const sanitizeHTML=(html)=>{ const d=document.createElement('div'); d.innerHTML=html; d.querySelectorAll('script,style,iframe,object,embed').forEach(n=>n.remove()); d.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{ if(/^on/i.test(a.name)) el.removeAttribute(a.name); });}); return d.innerHTML; };

  /* ===== 状態 ===== */
  let problems = loadJSON(LS_KEYS.PROBLEMS, []);
  let appState = loadJSON(LS_KEYS.APPSTATE, {
    recentQueue: [],
    forcedQueue: [],
    lastPastedHTML: "",
    lastPastedCats: "",
    lastSavedHTML: "",
    lastSavedCats: [],
  });
  let dailyStats = loadJSON(LS_KEYS.DAILYSTATS, {});
  let categoryStats = loadJSON(LS_KEYS.CATEGORY_STATS, {});

  /* ===== DOM 取得 ===== */
  const $ = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);

  // タブ
  const tabButtons = $$('.tab-btn');
  const pages = $$('.page');

  // A
  const startAllBtn = $('#startAllBtn');
  const startByCatBtn = $('#startByCatBtn');
  const questionContainer = $('#questionContainer');
  const revealBtn = $('#revealBtn');
  const judgeBtns = $('#judgeBtns');

  // B
  const editor = $('#editor');
  const maskBtn = $('#maskBtn');
  const unmaskAllBtn = $('#unmaskAllBtn');
  const repeatBtn = $('#repeatBtn');
  const clearDraftBtn = $('#clearDraftBtn');
  const catInput = $('#catInput');
  const saveProblemBtn = $('#saveProblemBtn');

  // C
  const problemList = $('#problemList');
  const catChips = $('#catChips');
  const clearCatFilterBtn = $('#clearCatFilterBtn');
  const exportJsonBtn = $('#exportJsonBtn');
  const importJsonInput = $('#importJsonInput');

  // D
  const progressCanvas = $('#progressChart');
  const dailyList = $('#dailyList');

  // モーダル
  const catModal = $('#catModal');
  const catModalBody = $('#catModalBody');
  const catModalCancel = $('#catModalCancel');
  const catModalStart = $('#catModalStart');

  const editModal = $('#editModal');
  const editEditor = $('#editEditor');
  const editCatInput = $('#editCatInput');
  const editMaskBtn = $('#editMaskBtn');
  const editUnmaskAllBtn = $('#editUnmaskAllBtn');
  const editCancelBtn = $('#editCancelBtn');
  const editSaveBtn = $('#editSaveBtn');
  const editMeta = $('#editMeta');

  /* ===== 自動マスク付与（選択しただけで） ===== */
  function autoMaskOnSelection(rootEditable){
    if (!rootEditable) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (!rootEditable.contains(range.commonAncestorContainer)) return;

    let anc = range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    const inMask = anc && anc.closest && anc.closest('.mask');
    if (inMask) {
      const t=inMask, p=t.parentNode;
      while(t.firstChild) p.insertBefore(t.firstChild,t);
      p.removeChild(t);
      sel.removeAllRanges();
      return;
    }
    try {
      const span=document.createElement('span'); span.className='mask';
      range.surroundContents(span);
    } catch {
      const frag=range.extractContents();
      const wrap=document.createElement('span'); wrap.className='mask';
      wrap.appendChild(frag); range.insertNode(wrap);
    }
    sel.removeAllRanges();
  }

  function toggleMaskSelection(rootEditable){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (!rootEditable.contains(range.commonAncestorContainer)) return;

    let anc = range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    const inMask = anc && anc.closest && anc.closest('.mask');
    if (inMask) {
      const t=inMask, p=t.parentNode;
      while(t.firstChild) p.insertBefore(t.firstChild,t);
      p.removeChild(t);
      return;
    }
    try {
      const span=document.createElement('span'); span.className='mask';
      range.surroundContents(span);
    } catch {
      const frag=range.extractContents();
      const wrap=document.createElement('span'); wrap.className='mask';
      wrap.appendChild(frag); range.insertNode(wrap);
    }
  }

  /* ===== タブ切替 ===== */
  tabButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabButtons.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      const target=btn.getAttribute('data-target');
      pages.forEach(p=>p.classList.remove('show'));
      const page=document.querySelector(target); if(page) page.classList.add('show');
      if (target==='#tab-c') renderC();
      if (target==='#tab-d') renderD();
    });
  });

  /* ===== B：問題作成 ===== */
  if (editor){
    editor.addEventListener('paste', ()=>setTimeout(()=>{
      appState.lastPastedHTML = editor.innerHTML;
      if (catInput && catInput.value && catInput.value.trim()) appState.lastPastedCats = catInput.value.trim();
      saveAll();
    },0));

    if (maskBtn) maskBtn.addEventListener('click', ()=>toggleMaskSelection(editor));
    if (unmaskAllBtn) unmaskAllBtn.addEventListener('click', ()=>unmaskAllIn(editor));

    ['mouseup','keyup','touchend'].forEach(ev=>{
      editor.addEventListener(ev, ()=>setTimeout(()=>autoMaskOnSelection(editor), 10));
    });
  }

  if (repeatBtn){
    repeatBtn.addEventListener('click', ()=>{
      if (appState.lastSavedHTML) {
        if (editor) editor.innerHTML = appState.lastSavedHTML;
        if (catInput) catInput.value = (appState.lastSavedCats||[]).join(', ');
      } else if (appState.lastPastedHTML) {
        if (editor) editor.innerHTML = appState.lastPastedHTML;
        if (catInput) catInput.value = appState.lastPastedCats || '';
      } else {
        alert('繰り返しできる直前データがありません。長文をペーストして保存してください。');
      }
    });
  }
  if (clearDraftBtn) clearDraftBtn.addEventListener('click', ()=>{ if(editor) editor.innerHTML=''; if(catInput) catInput.value=''; });
  if (catInput) catInput.addEventListener('change', ()=>{ appState.lastPastedCats = catInput.value.trim(); saveAll(); });

  if (saveProblemBtn){
    saveProblemBtn.addEventListener('click', ()=>{ 
      if (!editor) return;
      const html = editor.innerHTML.trim();
      if (!html){ alert('長文を入力してください。'); return; }
      const answers = extractAnswersFrom(editor);
      if (answers.length===0 && !confirm('マスクがありません。保存しますか？')) return;
      const categories = parseCategories(catInput?catInput.value:'');
      const now=Date.now(); const id=uuid();
      problems.push({ id, html, answers, categories, score:0, answerCount:0, correctCount:0, deleted:false, createdAt:now, updatedAt:now });
      appState.lastSavedHTML = html;
      appState.lastSavedCats = categories;
      saveAll();
      editor.innerHTML=''; if (catInput) catInput.value='';
      alert('保存しました。（Cタブに反映）');
      renderC();
    });
  }

  /* ===== C：編集/確認 ===== */
  let currentCatFilter = [];
  function renderC(){
    renderCategoryChips();
    renderProblemList();
  }

  function renderCategoryChips(){
    if (!catChips) return;
    const all=new Set();
    problems.filter(p=>!p.deleted).forEach(p=>(p.categories||[]).forEach(c=>all.add(c)));
    const cats=Array.from(all).sort((a,b)=>a.localeCompare(b,'ja'));
    catChips.innerHTML='';
    cats.forEach(cat=>{
      const label=document.createElement('label'); label.className='chip';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.value=cat; cb.checked=currentCatFilter.includes(cat);
      cb.addEventListener('change', ()=>{
        if (cb.checked) currentCatFilter.push(cat);
        else currentCatFilter=currentCatFilter.filter(c=>c!==cat);
        renderProblemList();
      });
      label.appendChild(cb); label.appendChild(document.createTextNode(cat));
      catChips.appendChild(label);
    });
  }
  if (clearCatFilterBtn) clearCatFilterBtn.addEventListener('click', ()=>{ currentCatFilter=[]; renderCategoryChips(); renderProblemList(); });

  function problemMatchesFilter(p){
    if (p.deleted) return false;
    if (currentCatFilter.length===0) return true;
    if (!p.categories||!p.categories.length) return false;
    return p.categories.some(c=>currentCatFilter.includes(c));
  }
  function renderProblemList(){
    if (!problemList) return;
    problemList.innerHTML='';
    const filtered=problems.filter(problemMatchesFilter);
    filtered.forEach((p, i)=>{
      const item=document.createElement('div'); item.className='problem-item';
      const t=document.createElement('div'); t.className='item-title'; t.textContent=`No.${i+1}　${firstSentenceFromHTML(p.html)}`;
      const sub=document.createElement('div'); sub.className='item-sub';
      const s1=document.createElement('span'); s1.textContent=`スコア: ${(p.score||0).toFixed(1)}`;
      const s2=document.createElement('span'); s2.textContent=`正答/回答: ${p.correctCount||0}/${p.answerCount||0}`;
      const bEdit=document.createElement('button'); bEdit.className='btn'; bEdit.textContent='編集';
      bEdit.addEventListener('click', ()=>openEditModal(p.id));
      const bDel=document.createElement('button'); bDel.className='btn'; bDel.textContent='削除';
      bDel.addEventListener('click', ()=>{
        if(!confirm('この問題を削除（ソフト）しますか？')) return;
        p.deleted=true; p.updatedAt=Date.now();
        saveAll(); renderC();
      });
      sub.appendChild(s1); sub.appendChild(s2); sub.appendChild(bEdit); sub.appendChild(bDel);
      item.appendChild(t); item.appendChild(sub); problemList.appendChild(item);
    });
    if (!filtered.length){
      const div=document.createElement('div'); div.className='muted'; div.textContent='該当する問題がありません。';
      problemList.appendChild(div);
    }
  }

  /* ===== Cタブ：カテゴリ選択エクスポート ===== */
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', ()=>{
    // 選択したカテゴリ
    const selectedCats = Array.from(catChips.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
    if (selectedCats.length === 0) {
      if (!confirm('カテゴリが選択されていません。全ての問題をエクスポートしますか？')) return;
    }

    const filteredProblems = problems.filter(p => 
      !p.deleted && (selectedCats.length===0 ? true : (p.categories||[]).some(c=>selectedCats.includes(c)))
    );

    const blob = new Blob([JSON.stringify({
      problems: filteredProblems,
      dailyStats,
      categoryStats
    }, null, 2)], { type:'application/json' });

    const url = URL.createObjectURL(blob);
    const d = new Date();
    const name = `export_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
    const a = document.createElement('a'); a.href=url; a.download=name; a.click();
    URL.revokeObjectURL(url);
    alert(`選択したカテゴリ (${selectedCats.join(', ') || '全て'}) の問題をエクスポートしました。`);
  });

  if (importJsonInput) importJsonInput.addEventListener('change', async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try{
      const text=await file.text(); const data=JSON.parse(text);
      if (Array.isArray(data.problems)){
        const map=new Map(problems.map(p=>[p.id,p])); data.problems.forEach(p=>map.set(p.id,p)); problems=Array.from(map.values());
      }
      if (data.dailyStats && typeof data.dailyStats==='object') dailyStats={...dailyStats,...data.dailyStats};
      if (data.categoryStats && typeof data.categoryStats==='object') categoryStats={...categoryStats,...data.categoryStats};
      saveAll(); renderC(); alert('インポートしました。');
    }catch(err){ console.error(err); alert('JSONの読み込みに失敗しました。'); }
    finally{ importJsonInput.value=''; }
  });

  /* ===== 編集モーダル ===== */
  let editingId=null;
  function openEditModal(id){
    const p=problems.find(x=>x.id===id); if(!p || !editModal) return;
    editingId=id;
    editModal.classList.remove('hidden'); editModal.setAttribute('aria-hidden','false');
    if (editEditor){
      editEditor.innerHTML = sanitizeHTML(p.html);
      editEditor.classList.add('editing');
      requestAnimationFrame(()=>{
        const r=document.createRange(); r.selectNodeContents(editEditor); r.collapse(false);
        const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); editEditor.focus();
      });
    }
    if (editCatInput) editCatInput.value = (p.categories||[]).join(', ');
    if (editMeta) editMeta.textContent=`正答: ${p.correctCount||0} / 回答: ${p.answerCount||0} / スコア: ${(p.score||0).toFixed(1)}`;
  }
  function closeEditModal(){
    editingId=null;
    if (!editModal) return;
    editModal.classList.add('hidden'); editModal.setAttribute('aria-hidden','true');
    if (editEditor){ editEditor.classList.remove('editing'); editEditor.innerHTML=''; }
    document.querySelector('[data-target="#tab-c"]')?.focus();
  }
  if (editMaskBtn && editEditor) editMaskBtn.addEventListener('click', ()=>toggleMaskSelection(editEditor));
  if (editUnmaskAllBtn && editEditor) editUnmaskAllBtn.addEventListener('click', ()=>unmaskAllIn(editEditor));
  if (editCancelBtn) editCancelBtn.addEventListener('click', ()=>closeEditModal());
  if (editSaveBtn) editSaveBtn.addEventListener('click', ()=>{
    const p=problems.find(x=>x.id===editingId); if(!p || !editEditor) return;
    p.html=editEditor.innerHTML.trim();
    p.answers=extractAnswersFrom(editEditor);
    p.categories=parseCategories(editCatInput?editCatInput.value:'');
    p.updatedAt=Date.now();
    saveAll(); closeEditModal(); renderC();
  });
  if (editEditor){
    ['mouseup','keyup','touchend'].forEach(ev=>{
      editEditor.addEventListener(ev, ()=>setTimeout(()=>autoMaskOnSelection(editEditor), 10));
    });
  }
  document.querySelectorAll('.modal .modal-backdrop').forEach(bg=>{
    bg.addEventListener('click', ()=>{
      if (catModal && !catModal.classList.contains('hidden')){ catModal.classList.add('hidden'); catModal.setAttribute('aria-hidden','true'); }
      if (editModal && !editModal.classList.contains('hidden')){ closeEditModal(); }
    });
  });

  /* ===== A：出題・採点 ===== */
  let currentPool=[]; let currentId=null; let isRevealed=false;

  if (startAllBtn) startAllBtn.addEventListener('click', ()=>startSession(null));
  if (startByCatBtn) startByCatBtn.addEventListener('click', ()=>openCatPicker());

  function openCatPicker(){
    if (!catModal || !catModalBody) return;
    catModalBody.innerHTML='';
    const set=new Set(); problems.filter(p=>!p.deleted).forEach(p=>(p.categories||[]).forEach(c=>set.add(c)));
    const cats=Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'));
    if (!cats.length){
      const div=document.createElement('div'); div.className='muted'; div.textContent='カテゴリがありません。Bタブで作成してください。';
      catModalBody.appendChild(div);
    } else {
      cats.forEach(cat=>{
        const label=document.createElement('label'); label.className='chip';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.value=cat;
        label.appendChild(cb); label.appendChild(document.createTextNode(cat));
        catModalBody.appendChild(label);
      });
    }
    catModal.classList.remove('hidden'); catModal.setAttribute('aria-hidden','false');
  }
  if (catModalCancel) catModalCancel.addEventListener('click', ()=>{ if(catModal){catModal.classList.add('hidden'); catModal.setAttribute('aria-hidden','true');} });
  if (catModalStart) catModalStart.addEventListener('click', ()=>{
    if (!catModalBody){ return; }
    const selected=Array.from(catModalBody.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.value);
    if (catModal){ catModal.classList.add('hidden'); catModal.setAttribute('aria-hidden','true'); }
    if (!selected.length){ alert('カテゴリを1つ以上選択してください。'); return; }
    startSession(selected);
  });

  function startSession(categories){
    let ids = problems.filter(p=>!p.deleted && (categories ? (p.categories||[]).some(c=>categories.includes(c)) : true)).map(p=>p.id);
   if (!ids.length){ 
  alert('出題できる問題がありません。Bタブで作成してください。'); 
  return; 
}

    currentPool=ids; currentId=null; appState.recentQueue=[];
    setReveal(false); renderQuestion(nextQuestionId());
  }

  if (questionContainer){
    questionContainer.addEventListener('click', (e)=>{
      const m = e.target.closest && e.target.closest('.mask');
      if (!m) return;
      if (isRevealed) return;
      m.classList.toggle('peek');
    });
  }

  function setReveal(show){
    isRevealed = show;
    if (!questionContainer) return;
    questionContainer.querySelectorAll('.mask.peek').forEach(m=>m.classList.remove('peek'));
    if (show){
      if (revealBtn) revealBtn.textContent='解答を隠す';
      if (judgeBtns) judgeBtns.classList.remove('hidden');
      questionContainer.querySelectorAll('.mask').forEach(m=>m.classList.add('revealed'));
    } else {
      if (revealBtn) revealBtn.textContent='解答確認';
      if (judgeBtns) judgeBtns.classList.add('hidden');
      questionContainer.querySelectorAll('.mask').forEach(m=>m.classList.remove('revealed'));
    }
  }
  if (revealBtn) revealBtn.addEventListener('click', ()=>setReveal(!isRevealed));

  if (judgeBtns) judgeBtns.addEventListener('click', (e)=>{
    const btn=e.target.closest && e.target.closest('button[data-mark]');
    if (!btn) return;
    gradeCurrent(btn.getAttribute('data-mark'));
  });

  function renderQuestion(id){
    const p=problems.find(x=>x.id===id); if(!p || !questionContainer) return;
    currentId=id; questionContainer.innerHTML=p.html||'<div class="placeholder">本文なし</div>';
    questionContainer.scrollTop=0; setReveal(false);
  }

  const weightOf = (p)=>1/(1+Math.max(0,p.score||0));

  function nextQuestionId(){
    appState.forcedQueue.forEach(it=>it.delay--);
    const idx=appState.forcedQueue.findIndex(it=>it.delay<=0);
    if (idx>=0){
      const ready=appState.forcedQueue.splice(idx,1)[0];
      if (currentPool.includes(ready.id)){
        appState.recentQueue.push(ready.id); appState.recentQueue=appState.recentQueue.slice(-5); saveAll(); return ready.id;
      }
    }
    const recent=new Set(appState.recentQueue);
    const cand=currentPool.filter(id=>!recent.has(id));
    const list=cand.length?cand:currentPool;
    const items=list.map(id=>({id, w: weightOf(problems.find(x=>x.id=id)||{})}));
    const total=items.reduce((s,x)=>s+x.w,0);
    let r=Math.random()*total;
    for(const it of items){ if((r-=it.w)<=0){ appState.recentQueue.push(it.id); appState.recentQueue=appState.recentQueue.slice(-5); saveAll(); return it.id; } }
    const fb=items[0]?.id ?? currentPool[0];
    appState.recentQueue.push(fb); appState.recentQueue=appState.recentQueue.slice(-5); saveAll(); return fb;
  }

  function gradeCurrent(mark){
    const p=problems.find(x=>x.id===currentId); if(!p) return;
    let d=0; if(mark==='o') d=+1; else if(mark==='d') d=-0.5; else if(mark==='x') d=-1;
    p.score=clamp((p.score||0)+d, -5, +10);
    p.answerCount=(p.answerCount||0)+1; if(mark==='o') p.correctCount=(p.correctCount||0)+1;
    p.updatedAt=Date.now();
    if (mark==='x') appState.forcedQueue.push({ id:p.id, delay:5 });

    const dk = todayKey();
    if (!dailyStats[dk]) dailyStats[dk] = { correct:0, total:0 };
    dailyStats[dk].total += 1;
    if (mark==='o') dailyStats[dk].correct += 1;

    (p.categories||[]).forEach(cat=>{
      if (!categoryStats[cat]) categoryStats[cat] = { correct:0, total:0 };
      categoryStats[cat].total += 1;
      if (mark==='o') categoryStats[cat].correct += 1;
    });

    saveAll();
    renderD();
    renderQuestion(nextQuestionId());
  }

  /* ===== D：記録 ===== */
  let progressChart = null;

  function renderD(){
    renderCategoryChart();
    renderDailyList();
  }

  function renderCategoryChart(){
    if (!progressCanvas || !window.Chart) return;
    const cats = Object.keys(categoryStats).sort((a,b)=>a.localeCompare(b,'ja'));
    const labels = cats.length?cats:['(データなし)'];
    const rates = cats.map(c=>{
      const s = categoryStats[c] || { correct:0, total:0 };
      return s.total? Math.round((s.correct / s.total) * 1000)/10 : 0;
    });
    const data = { labels, datasets: [{ label: '正答率（%）', data: rates }] };
    const options = {
      responsive:true, maintainAspectRatio:false,
      scales: { y: { beginAtZero:true, max:100, ticks:{ callback: v => v + '%' } } },
      plugins: { legend: { display:false } }
    };
    if (progressChart){ progressChart.destroy(); progressChart=null; }
    progressChart = new Chart(progressCanvas, { type:'bar', data, options });
  }

  function renderDailyList(){
    if (!dailyList) return;
    dailyList.innerHTML = '';
    const today = new Date();
    for(let i=0;i<30;i++){
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const v = dailyStats[key] || { correct:0, total:0 };
      const row = document.createElement('div'); row.className = 'daily-item';
      const left = document.createElement('div'); left.textContent = key;
      const right = document.createElement('div'); right.textContent = `${v.correct} / ${v.total}`;
      row.appendChild(left); row.appendChild(right);
      dailyList.appendChild(row);
    }
  }

  /* ===== 初期描画 ===== */
  renderC();

  window.addEventListener('beforeunload', ()=>{ saveAll(); });

})();
