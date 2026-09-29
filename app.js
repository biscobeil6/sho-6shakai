
'use strict';

const STORAGE_KEY = 'social6.progress.v1';
const SETTINGS_KEY = 'social6.settings.v1';
const state = {
  data: [], terms: [], issues: [],
  progress: loadJSON(STORAGE_KEY, { results: {}, cycles: {} }),
  settings: loadJSON(SETTINGS_KEY, { sessionSize: 20 }),
  filters: { grade:'全部', field:'全部', era:'全部', requiredOnly:false, type:'全部' },
  session: null
};
const GRADE_ORDER = ['全部','導入','3年','4年','5年','6年'];
const ERA_ORDER = ['全部','縄文','弥生','古墳','飛鳥','奈良','平安','鎌倉','室町','安土桃山','江戸','明治','大正','昭和前期','昭和後期'];
const main = document.getElementById('main');
const headerTitle = document.getElementById('headerTitle');
const headerSub = document.getElementById('headerSub');
document.getElementById('homeBtn').onclick = renderHome;
document.getElementById('statsBtn').onclick = renderStats;

init().catch(err => { console.error(err); state.issues.push(`起動エラー: ${err.message}`); renderHome(); });

async function init(){
  const [qr,tr] = await Promise.all([
    fetch('social6_questions.json',{cache:'no-store'}),
    fetch('social6_terms.json',{cache:'no-store'})
  ]);
  if(!qr.ok) throw new Error(`問題データを読み込めません（HTTP ${qr.status}）`);
  if(!tr.ok) throw new Error(`用語データを読み込めません（HTTP ${tr.status}）`);
  const qraw = await qr.json(), traw = await tr.json();
  const seen = new Set();
  for(const [i,q] of (qraw.questions||[]).entries()){
    if(!q.id || !q.question || !q.answer || !Array.isArray(q.affiliations)){ state.issues.push(`${i+1}番目: 必須項目不足`); continue; }
    if(seen.has(q.id)){ state.issues.push(`${i+1}番目: ID重複 ${q.id}`); continue; }
    seen.add(q.id); state.data.push(q);
  }
  state.terms = Array.isArray(traw.cards) ? traw.cards : [];
  renderHome();
}

function renderHome(){
  state.session = null;
  setHeader('小6社会 書答式', `全${state.data.length}問・手書き自己採点`);
  const gradeTiles = GRADE_ORDER.filter(x=>x!=='全部').map(g=>{
    const n = filterQuestions({...state.filters,grade:g,field:'全部',era:'全部',requiredOnly:false,type:'全部'}).length;
    return `<article class="unit-tile" data-grade="${escapeAttr(g)}"><h3>${escapeHTML(g)}</h3><p>${n}問</p><p>${gradeDescription(g)}</p></article>`;
  }).join('');
  main.innerHTML = `<section class="hero">
    <div class="settings-row">1回に解く問題数
      <div class="segmented" id="sizeSelector">
        ${[10,20,50].map(n=>`<button data-size="${n}" class="${state.settings.sessionSize===n?'active':''}">${n}</button>`).join('')}
        <button data-size="all" class="${state.settings.sessionSize==='all'?'active':''}">一周</button>
      </div>
    </div>
  </section>
  <section class="subject-group"><h2>学年を選んでください</h2><div class="tile-grid">
    <article class="unit-tile featured" data-grade="全部"><h3>全部</h3><p>${state.data.length}問</p><p>全学年を混ぜて出題</p></article>${gradeTiles}
  </div></section>
  <section class="home-tools">
    <button class="tool-tile note-feature" id="referenceNoteBtn"><strong>資料ノート</strong><span>小学校社会 完成ノート・全179ページ</span></button>
    <button class="tool-tile" id="termNoteBtn"><strong>用語ノート</strong><span>元の用語マスター654枚を確認</span></button>
    <button class="tool-tile" id="quickWrongBtn"><strong>△・×だけ復習</strong><span>迷った・書けなかった問題をまとめて復習</span></button>
  </section>
  ${state.issues.length?`<section class="panel"><h2>データ確認</h2>${state.issues.map(x=>`<div class="issue">${escapeHTML(x)}</div>`).join('')}</section>`:''}`;
  document.querySelectorAll('#sizeSelector button').forEach(btn=>btn.onclick=()=>{
    state.settings.sessionSize = btn.dataset.size==='all' ? 'all' : Number(btn.dataset.size);
    saveJSON(SETTINGS_KEY,state.settings); renderHome();
  });
  document.querySelectorAll('[data-grade]').forEach(el=>el.onclick=()=>{
    state.filters = {grade:el.dataset.grade,field:'全部',era:'全部',requiredOnly:false,type:'全部'};
    renderFilterScreen();
  });
  document.getElementById('referenceNoteBtn').onclick=renderReferenceNote;
  document.getElementById('termNoteBtn').onclick=()=>renderTermNote('全部','全部');
  document.getElementById('quickWrongBtn').onclick=startGlobalWrong;
}

function renderFilterScreen(){
  const f=state.filters;
  const fields = availableFields(f.grade);
  if(!fields.includes(f.field)) f.field='全部';
  const showEra = f.grade==='6年' && f.field==='歴史';
  if(!showEra) f.era='全部';
  const scoped = filterQuestions(f);
  setHeader(`${f.grade} 社会`, `${scoped.length}問が対象`);
  main.innerHTML = `<section class="filter-shell">
    <div class="filter-section"><h3>分野</h3><div class="chip-row">
      ${fields.map(x=>`<button class="filter-chip ${f.field===x?'active':''}" data-field="${escapeAttr(x)}">${escapeHTML(x)}</button>`).join('')}
    </div></div>
    ${showEra?`<div class="filter-section"><h3>時代</h3><div class="chip-row">
      ${availableEras().map(x=>`<button class="filter-chip ${f.era===x?'active':''}" data-era="${escapeAttr(x)}">${escapeHTML(x)}</button>`).join('')}
    </div></div>`:''}
    <div class="filter-section"><h3>出題条件</h3><div class="chip-row">
      <button class="filter-chip star ${f.requiredOnly?'active':''}" id="requiredToggle">★必修だけ</button>
      ${['全部','A','B'].map(x=>`<button class="filter-chip ${f.type===x?'active':''}" data-type="${x}">${x==='全部'?'A・B両方':`${x}型`}</button>`).join('')}
    </div></div>
    <div class="start-card">
      <p class="scope-summary">${scopeText(f)}<br><strong>${scoped.length}問</strong>が対象です。</p>
      <div class="start-actions">
        <button class="primary-btn" id="cycleStart" ${scoped.length?'':'disabled'}>周回モード</button>
        <button class="secondary-btn" id="wrongStart" ${countWrong(scoped)?'':'disabled'}>△・×だけ (${countWrong(scoped)}問)</button>
      </div>
    </div>
    <div class="button-row"><button class="secondary-btn" id="backHome">戻る</button><button class="secondary-btn" id="openTerms">この範囲の用語ノート</button></div>
  </section>`;
  document.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>{f.field=b.dataset.field; f.era='全部'; renderFilterScreen();});
  document.querySelectorAll('[data-era]').forEach(b=>b.onclick=()=>{f.era=b.dataset.era; renderFilterScreen();});
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{f.type=b.dataset.type; renderFilterScreen();});
  document.getElementById('requiredToggle').onclick=()=>{f.requiredOnly=!f.requiredOnly; renderFilterScreen();};
  document.getElementById('cycleStart').onclick=startCycle;
  document.getElementById('wrongStart').onclick=()=>startWrong(scoped);
  document.getElementById('backHome').onclick=renderHome;
  document.getElementById('openTerms').onclick=()=>renderTermNote(f.grade,f.field);
}

function availableFields(grade){
  const vals = new Set();
  for(const q of state.data) for(const a of q.affiliations){ if(grade==='全部'||a.grade===grade) if(a.field) vals.add(a.field); }
  return ['全部',...Array.from(vals)];
}
function availableEras(){return ERA_ORDER;}

function filterQuestions(filters){
  return state.data.filter(q=>{
    if(filters.requiredOnly && !q.required) return false;
    if(filters.type!=='全部' && q.type!==filters.type) return false;
    return q.affiliations.some(a=>
      (filters.grade==='全部'||a.grade===filters.grade) &&
      (filters.field==='全部'||a.field===filters.field) &&
      (filters.era==='全部'||a.era===filters.era)
    );
  });
}
function scopeText(f){
  const parts=[f.grade]; if(f.field!=='全部') parts.push(f.field); if(f.era!=='全部') parts.push(f.era);
  if(f.requiredOnly) parts.push('★必修'); if(f.type!=='全部') parts.push(`${f.type}型`);
  return parts.join(' ／ ');
}
function cycleKey(){const f=state.filters;return [f.grade,f.field,f.era,f.requiredOnly?'star':'all',f.type].join('::');}
function getCycle(){return state.progress.cycles[cycleKey()] ||= {doneIds:[],round:1};}
function startCycle(){
  const scoped=filterQuestions(state.filters), cycle=getCycle(), valid=new Set(scoped.map(q=>q.id));
  cycle.doneIds=cycle.doneIds.filter(id=>valid.has(id));
  let rem=scoped.filter(q=>!cycle.doneIds.includes(q.id));
  if(!rem.length){ if(!confirm(`1周完了しています。第${(cycle.round||1)+1}周を始めますか？`)) return; cycle.doneIds=[]; cycle.round=(cycle.round||1)+1; rem=[...scoped]; }
  saveProgress();
  const size=state.settings.sessionSize==='all'?rem.length:state.settings.sessionSize;
  beginSession(shuffle(rem).slice(0,size),{mode:'cycle',title:`${scopeText(state.filters)}・第${cycle.round||1}周`});
}
function startWrong(scoped){
  const wrong=scoped.filter(q=>['triangle','cross'].includes(state.progress.results[q.id]?.lastRating));
  if(!wrong.length){toast('復習する問題はありません');return;}
  const size=state.settings.sessionSize==='all'?wrong.length:state.settings.sessionSize;
  beginSession(shuffle(wrong).slice(0,size),{mode:'wrong',title:`${scopeText(state.filters)}・△×復習`});
}
function startGlobalWrong(){
  const wrong=state.data.filter(q=>['triangle','cross'].includes(state.progress.results[q.id]?.lastRating));
  if(!wrong.length){toast('まだ△・×の問題はありません');return;}
  const size=state.settings.sessionSize==='all'?wrong.length:state.settings.sessionSize;
  beginSession(shuffle(wrong).slice(0,size),{mode:'wrong-global',title:'全範囲・△×復習'});
}
function countWrong(scoped){return scoped.filter(q=>['triangle','cross'].includes(state.progress.results[q.id]?.lastRating)).length;}

function beginSession(questions,meta){
  if(!questions.length){toast('出題できる問題がありません');return;}
  state.session={questions,...meta,index:0,answered:0,circle:0,triangle:0,cross:0,answerShown:false,pendingRating:null};
  strokes=[]; renderQuestion();
}
function renderQuestion(){
  const s=state.session; if(!s||s.index>=s.questions.length) return renderResult();
  const q=s.questions[s.index]; setHeader(s.title,`${s.index+1}/${s.questions.length}`);
  const meta = questionMeta(q);
  main.innerHTML=`<section class="panel written-panel ${s.answerShown?'answer-shown':'answer-hidden'}">
    <div class="quiz-top"><div class="progress-track"><span style="width:${Math.round((s.index/s.questions.length)*100)}%"></span></div><span class="muted">○ ${s.circle} ／ △ ${s.triangle} ／ × ${s.cross}</span></div>
    <div class="meta-chips">${meta.map(x=>`<span class="meta-chip ${x==='★'?'required':''}">${escapeHTML(x)}</span>`).join('')}</div>
    <div class="question written-question">${escapeHTML(q.question)}</div>
    ${s.answerShown?answerBlock(q):''}
    <div class="hand-canvas-wrap"><canvas id="handCanvas" class="hand-canvas"></canvas>${strokes.length?'':'<div class="canvas-hint">ここに手書きします</div>'}</div>
    <div class="canvas-actions"><button class="secondary-btn" id="undoStrokeBtn">一つ戻す</button><button class="secondary-btn" id="clearCanvasBtn">全消去</button></div>
    ${s.answerShown?`<div class="written-ratings">
      <button data-rating="circle" class="judge-good ${s.pendingRating==='circle'?'selected':''}">○<small>できた</small></button>
      <button data-rating="triangle" class="judge-mid ${s.pendingRating==='triangle'?'selected':''}">△<small>迷った</small></button>
      <button data-rating="cross" class="judge-bad ${s.pendingRating==='cross'?'selected':''}">×<small>書けなかった</small></button>
    </div><div class="quiz-next-row"><button id="writtenNextBtn" class="primary-btn quiz-next-btn" ${s.pendingRating?'':'disabled'}>${s.index===s.questions.length-1?'結果を見る':'次へ'}</button></div>`:
    '<button id="showWrittenAnswerBtn" class="primary-btn written-answer-btn">答えを確認</button>'}
  </section>`;
  document.getElementById('undoStrokeBtn').onclick=undoStroke;
  document.getElementById('clearCanvasBtn').onclick=clearCanvas;
  if(!s.answerShown) document.getElementById('showWrittenAnswerBtn').onclick=()=>{s.answerShown=true;s.pendingRating=null;renderQuestion();};
  else {
    document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>{s.pendingRating=b.dataset.rating;renderQuestion();});
    document.getElementById('writtenNextBtn').onclick=commitWrittenAnswer;
  }
  setupHandCanvas();
}
function questionMeta(q){
  const vals=[]; const seen=new Set();
  for(const a of q.affiliations){ for(const x of [a.grade,a.field,a.era]) if(x&&!seen.has(x)){seen.add(x);vals.push(x);} }
  vals.push(`${q.type}型`); if(q.required) vals.push('★');
  return vals;
}
function answerBlock(q){
  const extras=[];
  if(q.reading) extras.push(`<div class="answer-info-row"><strong>読み：</strong>${escapeHTML(q.reading)}</div>`);
  if(q.accept) extras.push(`<div class="answer-info-row"><strong>許容・注意：</strong>${escapeHTML(q.accept)}</div>`);
  if(q.explanation) extras.push(`<div class="answer-info-row"><strong>解説：</strong>${escapeHTML(q.explanation)}</div>`);
  return `<div class="written-answer-block"><div class="written-answer-label">正答</div><div class="written-answer">${escapeHTML(q.answer)}</div>${extras.length?`<div class="answer-info">${extras.join('')}</div>`:''}</div>`;
}
function commitWrittenAnswer(){
  const s=state.session; if(!s||!s.pendingRating)return; const q=s.questions[s.index], rating=s.pendingRating;
  s.answered++; s[rating]++;
  const prev=state.progress.results[q.id]||{attempts:0,circle:0,triangle:0,cross:0};
  state.progress.results[q.id]={attempts:(prev.attempts||0)+1,circle:(prev.circle||0)+(rating==='circle'),triangle:(prev.triangle||0)+(rating==='triangle'),cross:(prev.cross||0)+(rating==='cross'),lastRating:rating,lastAnsweredAt:new Date().toISOString()};
  if(s.mode==='cycle'){const c=getCycle();if(!c.doneIds.includes(q.id))c.doneIds.push(q.id);}
  saveProgress(); s.index++; s.answerShown=false;s.pendingRating=null;strokes=[];renderQuestion();
}
function renderResult(){
  const s=state.session;if(!s)return renderHome();
  setHeader('今回の結果',`${s.questions.length}問`);
  main.innerHTML=`<section class="panel" style="text-align:center"><h2>おつかれさまでした</h2>
    <div class="result-badges"><span class="result-badge">○ ${s.circle}</span><span class="result-badge">△ ${s.triangle}</span><span class="result-badge">× ${s.cross}</span></div>
    <p class="muted">○率 ${Math.round((s.circle/Math.max(1,s.answered))*100)}%</p>
    <div class="button-row" style="justify-content:center"><button class="primary-btn" id="againBtn">同じ条件でもう一度</button><button class="secondary-btn" id="homeResultBtn">ホームへ</button></div>
  </section>`;
  document.getElementById('againBtn').onclick=()=>{ if(s.mode==='cycle') return startCycle(); if(s.mode==='wrong-global') return startGlobalWrong(); return startWrong(filterQuestions(state.filters)); };
  document.getElementById('homeResultBtn').onclick=renderHome;
}

function renderStats(){
  const answered=Object.values(state.progress.results); const attempts=answered.reduce((a,x)=>a+(x.attempts||0),0);
  const latest={circle:0,triangle:0,cross:0}; answered.forEach(x=>{if(latest[x.lastRating]!==undefined)latest[x.lastRating]++;});
  setHeader('成績','端末内に保存');
  main.innerHTML=`<section class="panel"><div class="stats-summary">
    <div class="stats-box"><span>一度でも解いた</span><strong>${answered.length}</strong><small>/${state.data.length}問</small></div>
    <div class="stats-box"><span>総回答回数</span><strong>${attempts}</strong></div>
    <div class="stats-box"><span>直近○率</span><strong>${answered.length?Math.round(latest.circle/answered.length*100):0}%</strong></div>
  </div><div class="result-badges"><span class="result-badge">直近 ○ ${latest.circle}</span><span class="result-badge">△ ${latest.triangle}</span><span class="result-badge">× ${latest.cross}</span></div>
  <div class="button-row"><button class="secondary-btn" id="statsHome">戻る</button><button class="danger-btn" id="resetProgress">学習記録をリセット</button></div></section>`;
  document.getElementById('statsHome').onclick=renderHome;
  document.getElementById('resetProgress').onclick=()=>{if(confirm('この端末の学習記録をすべて消しますか？')){state.progress={results:{},cycles:{}};saveProgress();renderStats();}};
}


function renderReferenceNote(){
  state.session=null;
  setHeader('社会資料ノート','全179ページ・完成版');
  main.innerHTML=`<section class="history-note-shell">
    <div class="history-note-toolbar">
      <div><strong>小学校社会 資料ノート</strong><span>PDF・179ページ</span></div>
      <div class="button-row history-note-actions">
        <a class="primary-btn history-note-open" href="social_note_179.pdf" target="_blank" rel="noopener">PDFを大きく開く</a>
        <button class="secondary-btn" id="backFromReferenceNote">ホームへ戻る</button>
      </div>
    </div>
    <div class="history-note-viewer">
      <iframe class="history-note-frame" src="social_note_179.pdf#page=1&view=FitH" title="小学校社会 資料ノート 179ページ"></iframe>
      <div class="history-note-fallback">PDFが表示されない場合は「PDFを大きく開く」を押してください。</div>
    </div>
  </section>`;
  document.getElementById('backFromReferenceNote').onclick=renderHome;
}

function renderTermNote(grade='全部',field='全部'){
  setHeader('用語ノート',`${state.terms.length}カード`);
  const fields=termFields(grade);
  if(!fields.includes(field))field='全部';
  main.innerHTML=`<section class="panel"><h2>用語ノート</h2><div class="note-toolbar">
    <div class="chip-row">${GRADE_ORDER.map(g=>`<button class="filter-chip ${grade===g?'active':''}" data-note-grade="${escapeAttr(g)}">${escapeHTML(g)}</button>`).join('')}</div>
    <div class="chip-row">${fields.map(x=>`<button class="filter-chip ${field===x?'active':''}" data-note-field="${escapeAttr(x)}">${escapeHTML(x)}</button>`).join('')}</div>
    <input id="noteSearch" class="note-search" type="search" placeholder="用語・定義を検索">
  </div><div id="noteList" class="note-list"></div><div class="button-row"><button class="secondary-btn" id="noteBack">戻る</button></div></section>`;
  const draw=()=>{
    const word=(document.getElementById('noteSearch').value||'').trim().toLowerCase();
    const cards=state.terms.filter(c=>(grade==='全部'||c.grade===grade)&&(field==='全部'||c.field===field)&&(!word||`${c.term} ${c.reading} ${c.definition} ${c.supplement}`.toLowerCase().includes(word)));
    document.getElementById('noteList').innerHTML=cards.map(c=>`<article class="note-card"><div class="note-meta">${escapeHTML(c.grade)}${c.field?' ／ '+escapeHTML(c.field):''} ／ p${escapeHTML(c.page)}${c.required?' ／ ★':''}</div><h3>${escapeHTML(c.term)}${c.reading?` <small>（${escapeHTML(c.reading)}）</small>`:''}</h3><p>${escapeHTML(c.definition)}</p>${c.supplement?`<p class="supplement">${escapeHTML(c.supplement)}</p>`:''}</article>`).join('') || '<div class="empty">該当する用語はありません</div>';
  };
  draw(); document.getElementById('noteSearch').oninput=draw;
  document.querySelectorAll('[data-note-grade]').forEach(b=>b.onclick=()=>renderTermNote(b.dataset.noteGrade,'全部'));
  document.querySelectorAll('[data-note-field]').forEach(b=>b.onclick=()=>renderTermNote(grade,b.dataset.noteField));
  document.getElementById('noteBack').onclick=renderHome;
}
function termFields(grade){const s=new Set();state.terms.forEach(c=>{if((grade==='全部'||c.grade===grade)&&c.field)s.add(c.field);});return ['全部',...s];}

// ===== Handwriting engine carried over from the iPad-tuned v3.7.0 app =====
let strokes=[],currentStroke=null,handCtx=null,handCanvas=null,activePointerId=null,lastPoint=null;
function setupHandCanvas(){
  handCanvas=document.getElementById('handCanvas'); if(!handCanvas)return;
  const rect=handCanvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  handCanvas.width=Math.max(1,Math.round(rect.width*dpr));handCanvas.height=Math.max(1,Math.round(rect.height*dpr));
  handCtx=handCanvas.getContext('2d',{alpha:true,desynchronized:true});handCtx.setTransform(dpr,0,0,dpr,0,0);drawAllStrokes();
  let activeSource=null,touchId=null,lastStart={time:-Infinity,x:0,y:0,source:null};
  const pos=e=>{const r=handCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<12,eventPoint=e=>({x:e.clientX,y:e.clientY});
  const configure=()=>{handCtx.strokeStyle='#1f2937';handCtx.fillStyle='#1f2937';handCtx.lineWidth=4;handCtx.lineCap='round';handCtx.lineJoin='round'};
  const segment=(a,b)=>{configure();handCtx.beginPath();handCtx.moveTo(a.x,a.y);handCtx.lineTo(b.x,b.y);handCtx.stroke()};
  const dot=p=>{configure();handCtx.beginPath();handCtx.arc(p.x,p.y,2,0,Math.PI*2);handCtx.fill()};
  const batch=e=>typeof e.getCoalescedEvents==='function'&&e.getCoalescedEvents()?.length?e.getCoalescedEvents():[e];
  const append=e=>{if(!currentStroke)return;for(const ev of batch(e)){const p=pos(ev);if(!lastPoint){currentStroke.push(p);lastPoint=p;dot(p);continue;}if(Math.abs(p.x-lastPoint.x)<.05&&Math.abs(p.y-lastPoint.y)<.05)continue;currentStroke.push(p);segment(lastPoint,p);lastPoint=p;}};
  const reset=()=>{activePointerId=null;currentStroke=null;lastPoint=null};
  const begin=e=>{reset();activePointerId=e.pointerId;currentStroke=[];strokes.push(currentStroke);append(e);document.querySelector('.canvas-hint')?.remove();};
  const finish=e=>{if(activePointerId===null||!currentStroke)return;if(e&&e.pointerId!==undefined&&e.pointerId!==activePointerId)return;if(e?.type==='pointerup')append(e);reset();};
  const duplicate=(source,e)=>{const now=performance.now(),p=eventPoint(e),dup=source!==lastStart.source&&now-lastStart.time<120&&near(p,lastStart);if(!dup)lastStart={time:now,x:p.x,y:p.y,source};return dup;};
  handCanvas.oncontextmenu=e=>e.preventDefault();for(const ev of ['selectstart','dragstart','gesturestart'])handCanvas.addEventListener(ev,e=>e.preventDefault(),{passive:false});
  if('PointerEvent'in window){
    handCanvas.addEventListener('pointerdown',e=>{e.preventDefault();if(duplicate('pointer',e))return;activeSource='pointer';begin(e);},{passive:false});
    for(const ev of ['pointermove','pointerrawupdate'])handCanvas.addEventListener(ev,e=>{if(activeSource==='touch')return;if((activePointerId===null||!currentStroke)&&e.pointerType==='pen'&&(e.pressure>0||e.buttons!==0))begin(e);if(e.pointerId!==activePointerId||!currentStroke)return;e.preventDefault();append(e);},{passive:false});
    for(const ev of ['pointerup','pointercancel'])handCanvas.addEventListener(ev,e=>{if(activeSource!=='pointer')return;e.preventDefault();finish(e);activeSource=null;},{passive:false});
  }
  const findTouch=(list,id)=>Array.from(list||[]).find(t=>t.identifier===id);
  handCanvas.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(!t)return;e.preventDefault();const synthetic={pointerId:`t-${t.identifier}`,pointerType:t.touchType==='stylus'?'pen':'touch',pressure:t.force||1,buttons:1,clientX:t.clientX,clientY:t.clientY,getCoalescedEvents:null};if(duplicate('touch',synthetic))return;activeSource='touch';touchId=t.identifier;begin(synthetic);},{passive:false});
  handCanvas.addEventListener('touchmove',e=>{if(activeSource!=='touch'||touchId===null)return;const t=findTouch(e.changedTouches,touchId)||findTouch(e.touches,touchId);if(!t)return;e.preventDefault();append({pointerId:`t-${t.identifier}`,clientX:t.clientX,clientY:t.clientY,getCoalescedEvents:null});},{passive:false});
  for(const ev of ['touchend','touchcancel'])handCanvas.addEventListener(ev,e=>{if(activeSource!=='touch'||touchId===null)return;const t=findTouch(e.changedTouches,touchId);if(!t&&ev==='touchend')return;e.preventDefault();finish({pointerId:`t-${touchId}`});touchId=null;activeSource=null;},{passive:false});
}
function drawAllStrokes(){if(!handCtx||!handCanvas)return;const rect=handCanvas.getBoundingClientRect();handCtx.clearRect(0,0,rect.width,rect.height);handCtx.strokeStyle='#1f2937';handCtx.fillStyle='#1f2937';handCtx.lineWidth=4;handCtx.lineCap='round';handCtx.lineJoin='round';for(const stroke of strokes){if(!stroke.length)continue;if(stroke.length===1){handCtx.beginPath();handCtx.arc(stroke[0].x,stroke[0].y,2,0,Math.PI*2);handCtx.fill();continue;}handCtx.beginPath();handCtx.moveTo(stroke[0].x,stroke[0].y);for(let i=1;i<stroke.length;i++)handCtx.lineTo(stroke[i].x,stroke[i].y);handCtx.stroke();}}
function undoStroke(){if(!strokes.length)return;strokes.pop();drawAllStrokes();if(!strokes.length&&!document.querySelector('.canvas-hint'))document.querySelector('.hand-canvas-wrap')?.insertAdjacentHTML('beforeend','<div class="canvas-hint">ここに手書きします</div>');}
function clearCanvas(){strokes=[];drawAllStrokes();if(!document.querySelector('.canvas-hint'))document.querySelector('.hand-canvas-wrap')?.insertAdjacentHTML('beforeend','<div class="canvas-hint">ここに手書きします</div>');}

function gradeDescription(g){return ({'導入':'地図・資料の基本','3年':'市・店・安全・移り変わり','4年':'都道府県・くらし・防災・地域','5年':'国土・産業・情報・環境','6年':'政治・歴史・国際'})[g]||'';}
function setHeader(t,s=''){headerTitle.textContent=t;headerSub.textContent=s;}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(v){return escapeHTML(v);}
function loadJSON(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function saveJSON(k,v){localStorage.setItem(k,JSON.stringify(v));}
function saveProgress(){saveJSON(STORAGE_KEY,state.progress);}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.add('hidden'),1800);}
