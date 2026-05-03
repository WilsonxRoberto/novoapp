// =====================================================
// CONFIGURACAO PRINCIPAL
// =====================================================
// 1) Depois de publicar o Google Apps Script como Web App,
//    cole a URL abaixo.
// 2) Exemplo: https://script.google.com/macros/s/AKfycbx.../exec
const API_URL = 'https://script.google.com/macros/s/AKfycbwj5eSU_eRywgZU2W1tAEPmkxpOsrwFl2qHdjA9mRrN59qwgQ2hFbbiBVIHVaOJcIqkaA/exec';

// Token opcional. Se voce preencher WRITE_TOKEN no Code.gs,
// coloque o mesmo valor aqui. Se deixar vazio no Code.gs, deixe vazio aqui tambem.
const API_TOKEN = '';

// Fallback de leitura, caso o Apps Script ainda nao esteja configurado.
const SHEET_ID = '1WkmVkfNAu83_Sc7AfFnofP-1oSpdJxdjOmlyTcLcvTc';
const SHEET_GID = '247051946';
const CSV_URLS = [
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`
];

const CACHE_KEY = 'controle_estoque_v2_cache';

let items = [];
let history = [];
let filter = 'todos';
let activeSector = 'todos';
let lastLoadedAt = null;

const $ = (id) => document.getElementById(id);

function apiConfigured(){
  return API_URL && !API_URL.includes('COLE_AQUI') && API_URL.startsWith('http');
}

function normalize(s){
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function toNumber(v){
  if(v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/\s/g,'');
  if(!s) return 0;
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
  else s = s.replace(',','.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n){
  const x = Number(n || 0);
  return Number.isInteger(x) ? String(x) : x.toLocaleString('pt-BR',{maximumFractionDigits:3});
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function setAlert(type, msg){
  const cls = type === 'success' ? 'success' : type === 'danger' ? 'danger' : '';
  $('systemAlert').innerHTML = msg ? `<div class="alert ${cls}">${msg}</div>` : '';
}

function setMessage(el, type, msg){
  const cls = type === 'success' ? 'success' : type === 'danger' ? 'danger' : '';
  el.innerHTML = msg ? `<div class="alert ${cls}">${msg}</div>` : '';
}

function getStatus(item){
  const qtd = Number(item.qtd || 0);
  const minimo = Number(item.minimo || 0);
  const maximo = Number(item.maximo || 0);
  if(qtd <= 0) return {key:'zero', label:'Zerado', cls:'zero'};
  if(minimo > 0 && qtd < minimo) return {key:'baixo', label:'Baixo estoque', cls:'low'};
  if(maximo > 0 && qtd > maximo) return {key:'excesso', label:'Acima do máximo', cls:'extra'};
  return {key:'ok', label:'OK', cls:'ok'};
}

function apiRequest(action, params = {}){
  if(!apiConfigured()){
    return Promise.reject(new Error('API do Google Apps Script ainda nao configurada.'));
  }

  return new Promise((resolve, reject) => {
    const callbackName = '__estoque_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const url = new URL(API_URL);

    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', Date.now());

    if(API_TOKEN) url.searchParams.set('token', API_TOKEN);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value ?? '');
    });

    const script = document.createElement('script');
    let finished = false;

    function cleanup(){
      finished = true;
      try{ delete window[callbackName]; }catch(e){ window[callbackName] = undefined; }
      if(script.parentNode) script.parentNode.removeChild(script);
    }

    const timer = setTimeout(() => {
      if(finished) return;
      cleanup();
      reject(new Error('Tempo esgotado ao conectar com o Google Apps Script.'));
    }, 20000);

    window[callbackName] = function(data){
      clearTimeout(timer);
      cleanup();

      if(!data || data.ok === false){
        reject(new Error((data && data.error) ? data.error : 'Erro desconhecido no Apps Script.'));
        return;
      }

      resolve(data);
    };

    script.onerror = function(){
      clearTimeout(timer);
      cleanup();
      reject(new Error('Falha ao carregar o script do Apps Script. Verifique se o Web App esta publicado para Qualquer pessoa.'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function loadData(){
  $('headerStatus').textContent = 'Atualizando dados...';
  setAlert('', '');

  try{
    if(apiConfigured()){
      const data = await apiRequest('listar');
      items = data.items || [];
      history = data.history || [];
      lastLoadedAt = new Date();
      saveCache();
      setAlert('success', `Base conectada ao Google Apps Script. ${items.length} itens carregados.`);
    }else{
      await loadCsvFallback();
      setAlert('danger', 'Modo somente consulta: configure a URL do Google Apps Script em js/app.js para habilitar entrada, saída e cadastro de novo item.');
    }
  }catch(err){
    const cached = loadCache();
    if(cached){
      items = cached.items || [];
      history = cached.history || [];
      lastLoadedAt = new Date(cached.savedAt);
      setAlert('danger', `Nao consegui atualizar online. Carreguei o cache deste aparelho. Detalhe: ${escapeHtml(err.message)}`);
    }else{
      setAlert('danger', `Nao foi possivel carregar os dados. Detalhe: ${escapeHtml(err.message)}`);
    }
  }

  renderAll();
}

async function loadCsvFallback(){
  let lastError = null;
  for(const baseUrl of CSV_URLS){
    try{
      const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cacheBust=' + Date.now();
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('Erro HTTP ' + res.status);
      const text = await res.text();
      if(!text || text.toLowerCase().includes('<html')) throw new Error('A resposta nao parece ser CSV.');
      const rows = parseCSV(text);
      items = mapRows(rows);
      history = [];
      lastLoadedAt = new Date();
      saveCache();
      return;
    }catch(err){ lastError = err; }
  }
  throw lastError || new Error('CSV da planilha indisponivel.');
}

function saveCache(){
  localStorage.setItem(CACHE_KEY, JSON.stringify({savedAt:new Date().toISOString(), items, history}));
}

function loadCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}

function parseCSV(text){
  const rows = [];
  let row = [], cur = '', quote = false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(ch === '"' && quote && nx === '"'){cur += '"'; i++; continue;}
    if(ch === '"'){quote = !quote; continue;}
    if((ch === ',' || ch === ';' || ch === '\t') && !quote){row.push(cur); cur=''; continue;}
    if((ch === '\n' || ch === '\r') && !quote){
      if(cur || row.length){row.push(cur); rows.push(row); row=[]; cur='';}
      if(ch === '\r' && nx === '\n') i++;
      continue;
    }
    cur += ch;
  }
  if(cur || row.length){row.push(cur); rows.push(row);}
  return rows.filter(r => r.some(c => String(c).trim()));
}

function mapRows(rows){
  if(!rows.length) return [];
  const headers = rows[0].map(h => normalize(h));
  const idx = (...names) => names.map(n => headers.indexOf(normalize(n))).find(i => i >= 0) ?? -1;
  const iSetor = idx('setor','categoria','grupo');
  const iCodigo = idx('codigo','código','cod','sku');
  const iProduto = idx('produto','item','descricao','descrição','nome');
  const iQtd = idx('qtd','quantidade','saldo','estoque');
  const iMin = idx('minimo','mínimo','min');
  const iMax = idx('maximo','máximo','max');
  const iUn = idx('unidade','und','un');
  const iObs = idx('observacao','observação','obs');
  if(iProduto < 0 || iQtd < 0) throw new Error('Colunas produto e qtd nao encontradas.');
  return rows.slice(1).map((r,i)=>({
    row:i+2,
    setor:String(r[iSetor] || 'GERAL').trim() || 'GERAL',
    codigo:String(r[iCodigo] || '').trim(),
    produto:String(r[iProduto] || '').trim(),
    qtd:toNumber(r[iQtd]),
    minimo:toNumber(r[iMin]),
    maximo:toNumber(r[iMax]),
    unidade:String(r[iUn] || '').trim(),
    observacao:String(r[iObs] || '').trim()
  })).filter(i => i.produto);
}

function renderStats(){
  const total = items.length;
  const baixos = items.filter(i => getStatus(i).key === 'baixo').length;
  const zerados = items.filter(i => getStatus(i).key === 'zero').length;
  const compras = shoppingItems().length;
  $('stats').innerHTML = `
    <div class="stat"><b>${total}</b><span>itens cadastrados</span></div>
    <div class="stat"><b>${baixos}</b><span>baixo estoque</span></div>
    <div class="stat"><b>${zerados}</b><span>zerados</span></div>
    <div class="stat"><b>${compras}</b><span>itens para comprar</span></div>`;
  $('headerStatus').textContent = lastLoadedAt ? `Ultima atualizacao: ${lastLoadedAt.toLocaleString('pt-BR')}` : 'Base nao carregada';
}

function renderSectorFilter(){
  const sectors = [...new Set(items.map(i => i.setor || 'GERAL'))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('sectorFilter').innerHTML = `<option value="todos">Todos os setores</option>` + sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  $('sectorFilter').value = activeSector;

  const currentNew = $('newSetor').value.trim();
  if(!currentNew && sectors.length) $('newSetor').value = sectors[0];
}

function filteredItems(){
  const q = normalize($('searchStock').value);
  return items.filter(i => {
    const st = getStatus(i).key;
    const matchText = !q || normalize(`${i.setor} ${i.codigo} ${i.produto} ${i.observacao}`).includes(q);
    const matchSector = activeSector === 'todos' || i.setor === activeSector;
    const matchFilter = filter === 'todos' || filter === st;
    return matchText && matchSector && matchFilter;
  }).sort((a,b)=>a.produto.localeCompare(b.produto,'pt-BR'));
}

function renderStock(){
  const arr = filteredItems();
  const box = $('stockList');
  if(!arr.length){box.innerHTML = '<div class="empty">Nenhum item encontrado.</div>'; return;}
  box.innerHTML = arr.map(i => {
    const st = getStatus(i);
    return `<div class="item ${st.cls}">
      <div>
        <div class="name">${escapeHtml(i.produto)}</div>
        <div class="code">${escapeHtml(i.codigo || 'sem código')} • ${escapeHtml(i.setor)} ${i.unidade ? '• ' + escapeHtml(i.unidade) : ''}</div>
        <div class="metaRow"><span class="badge ${st.cls}">${st.label}</span><span class="badge">mín: ${fmt(i.minimo)}</span><span class="badge">máx: ${fmt(i.maximo)}</span></div>
      </div>
      <div class="qty">${fmt(i.qtd)}<small>em estoque</small></div>
      <div class="actions">
        <button class="btn ok" type="button" onclick="presetMovement(${i.row}, 'entrada')">Entrada</button>
        <button class="btn warn" type="button" onclick="presetMovement(${i.row}, 'saida')">Saída</button>
      </div>
    </div>`;
  }).join('');
}

function renderMovementSelect(){
  const q = normalize($('movSearch').value);
  const arr = items.filter(i => !q || normalize(`${i.codigo} ${i.produto} ${i.setor}`).includes(q)).sort((a,b)=>a.produto.localeCompare(b.produto,'pt-BR'));
  $('movItem').innerHTML = arr.map(i => `<option value="${i.row}">${escapeHtml(i.codigo || 'sem código')} - ${escapeHtml(i.produto)} | qtd: ${fmt(i.qtd)}</option>`).join('');
}

function renderHistory(){
  const box = $('historyList');
  if(!history.length){box.innerHTML = '<div class="empty">Nenhum histórico carregado.</div>'; return;}
  box.innerHTML = history.slice(0,20).map(h => {
    const type = String(h.tipo || h.type || '').toLowerCase();
    const sign = type === 'entrada' || type === 'cadastro' ? '+' : '-';
    const cls = type === 'entrada' || type === 'cadastro' ? 'ok' : 'warn';
    return `<div class="item"><div><div class="name">${sign}${fmt(h.quantidade || h.qtd)} • ${escapeHtml(h.produto || '')}</div><div class="code">${escapeHtml(h.codigo || '')} • ${escapeHtml(h.tipo || '')} • ${escapeHtml(h.data || '')}</div>${h.observacao ? `<div class="hint">${escapeHtml(h.observacao)}</div>` : ''}</div><span class="badge ${cls}">${escapeHtml(h.tipo || '')}</span></div>`;
  }).join('');
}

function shoppingItems(){
  return items.filter(i => ['zero','baixo'].includes(getStatus(i).key)).sort((a,b) => {
    const az = getStatus(a).key === 'zero' ? 0 : 1;
    const bz = getStatus(b).key === 'zero' ? 0 : 1;
    return az - bz || a.produto.localeCompare(b.produto,'pt-BR');
  });
}

function suggestedBuy(i){
  const qtd = Number(i.qtd || 0);
  const min = Number(i.minimo || 0);
  const max = Number(i.maximo || 0);
  if(max > 0 && max > qtd) return max - qtd;
  if(min > 0 && min > qtd) return min - qtd;
  return qtd <= 0 ? 1 : 0;
}

function renderShopping(){
  const arr = shoppingItems();
  const box = $('shoppingList');
  if(!arr.length){box.innerHTML = '<div class="empty">Nenhum item para comprar agora.</div>'; return;}
  box.innerHTML = arr.map(i => {
    const st = getStatus(i);
    return `<div class="item ${st.cls}"><div><div class="name">${escapeHtml(i.produto)}</div><div class="code">${escapeHtml(i.codigo || 'sem código')} • ${escapeHtml(i.setor)}</div><div class="metaRow"><span class="badge ${st.cls}">${st.label}</span><span class="badge">atual: ${fmt(i.qtd)}</span><span class="badge">mín: ${fmt(i.minimo)}</span><span class="badge">máx: ${fmt(i.maximo)}</span></div></div><div class="qty">${fmt(suggestedBuy(i))}<small>sugestão</small></div></div>`;
  }).join('');
}

function renderAll(){
  renderStats();
  renderSectorFilter();
  renderStock();
  renderMovementSelect();
  renderHistory();
  renderShopping();
}

function showScreen(screenId){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.screen === screenId));
  window.scrollTo({top:0,behavior:'smooth'});
}

function presetMovement(row, tipo){
  showScreen('telaMovimento');
  $('movSearch').value = '';
  renderMovementSelect();
  $('movItem').value = String(row);
  $('movType').value = tipo;
  $('movQty').focus();
}

async function submitMovement(ev){
  ev.preventDefault();
  const msg = $('movMsg');
  if(!apiConfigured()){
    setMessage(msg, 'danger', 'Configure a URL do Apps Script em js/app.js para salvar entrada e saída na planilha.');
    return;
  }
  const row = $('movItem').value;
  const tipo = $('movType').value;
  const quantidade = toNumber($('movQty').value);
  const observacao = $('movNote').value.trim();
  if(!row || quantidade <= 0){setMessage(msg, 'danger', 'Informe produto e quantidade maior que zero.'); return;}
  try{
    $('movementForm').querySelector('button[type="submit"]').disabled = true;
    const data = await apiRequest('movimentar', {row, tipo, quantidade, observacao});
    setMessage(msg, 'success', data.message || 'Movimentação salva com sucesso.');
    $('movQty').value = '';
    $('movNote').value = '';
    await loadData();
    showScreen('telaMovimento');
  }catch(err){
    setMessage(msg, 'danger', escapeHtml(err.message));
  }finally{
    $('movementForm').querySelector('button[type="submit"]').disabled = false;
  }
}

async function submitAdd(ev){
  ev.preventDefault();
  const msg = $('addMsg');
  if(!apiConfigured()){
    setMessage(msg, 'danger', 'Configure a URL do Apps Script em js/app.js para cadastrar direto na planilha.');
    return;
  }
  const payload = {
    setor:$('newSetor').value.trim(),
    codigo:$('newCodigo').value.trim(),
    produto:$('newProduto').value.trim(),
    qtd:toNumber($('newQtd').value),
    minimo:toNumber($('newMin').value),
    maximo:toNumber($('newMax').value),
    unidade:$('newUnidade').value.trim(),
    observacao:$('newObs').value.trim()
  };
  if(!payload.setor || !payload.produto){setMessage(msg, 'danger', 'Informe pelo menos setor e produto.'); return;}
  try{
    $('addForm').querySelector('button[type="submit"]').disabled = true;
    const data = await apiRequest('adicionar', payload);
    setMessage(msg, 'success', data.message || 'Item cadastrado com sucesso.');
    $('newCodigo').value = '';
    $('newProduto').value = '';
    $('newQtd').value = '0';
    $('newMin').value = '1';
    $('newMax').value = '10';
    $('newObs').value = '';
    await loadData();
    showScreen('telaNovo');
  }catch(err){
    setMessage(msg, 'danger', escapeHtml(err.message));
  }finally{
    $('addForm').querySelector('button[type="submit"]').disabled = false;
  }
}

function exportShopping(){
  const arr = shoppingItems();
  if(!arr.length){alert('Nao ha itens para comprar.'); return;}
  const rows = [['setor','codigo','produto','qtd_atual','minimo','maximo','sugestao_compra','unidade','observacao'], ...arr.map(i => [i.setor,i.codigo,i.produto,i.qtd,i.minimo,i.maximo,suggestedBuy(i),i.unidade,i.observacao])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lista_de_compras.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function bindEvents(){
  $('btnReload').addEventListener('click', loadData);
  $('searchStock').addEventListener('input', renderStock);
  $('sectorFilter').addEventListener('change', function(){activeSector = this.value; renderStock();});
  $('movSearch').addEventListener('input', renderMovementSelect);
  $('movementForm').addEventListener('submit', submitMovement);
  $('addForm').addEventListener('submit', submitAdd);
  $('btnExportShopping').addEventListener('click', exportShopping);
  document.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => showScreen(btn.dataset.screen)));
  document.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderStock();
  }));
}

bindEvents();
loadData();
