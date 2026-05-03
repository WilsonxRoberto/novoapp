const CONFIG = {
  SPREADSHEET_ID: '1WkmVkfNAu83_Sc7AfFnofP-1oSpdJxdjOmlyTcLcvTc',
  DATA_SHEET_NAME: 'BASE_SITE',
  DATA_SHEET_GID: 247051946,
  HISTORY_SHEET_NAME: 'HISTORICO',

  // Opcional: coloque uma senha simples aqui e repita em API_TOKEN no js/app.js.
  // Se deixar vazio, nao exige token.
  WRITE_TOKEN: ''
};

const DATA_HEADERS = ['setor','codigo','produto','qtd','minimo','maximo','unidade','observacao'];
const HISTORY_HEADERS = ['data','tipo','codigo','produto','quantidade','saldo_anterior','saldo_atual','usuario','observacao'];

function doGet(e){
  const params = e && e.parameter ? e.parameter : {};

  try{
    const action = String(params.action || 'listar').toLowerCase();

    if(action === 'listar') {
      return output_({
        ok:true,
        items:listItems_(),
        history:listHistory_(20),
        updatedAt:new Date().toISOString()
      }, params);
    }

    if(action === 'historico') {
      return output_({
        ok:true,
        history:listHistory_(100),
        updatedAt:new Date().toISOString()
      }, params);
    }

    checkToken_(params);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try{
      if(action === 'movimentar') return output_(movement_(params), params);
      if(action === 'adicionar') return output_(addItem_(params), params);
      if(action === 'setup') return output_(setup_(), params);

      throw new Error('Acao invalida: ' + action);
    }finally{
      lock.releaseLock();
    }

  }catch(err){
    return output_({
      ok:false,
      error:String(err && err.message ? err.message : err)
    }, params);
  }
}

function doPost(e){
  const params = e && e.parameter ? e.parameter : {};
  return output_({
    ok:false,
    error:'Use GET/JSONP nesta versao do sistema.'
  }, params);
}

function output_(obj, params){
  const json = JSON.stringify(obj);
  const callback = String((params && (params.callback || params.prefix)) || '').trim();

  if(callback){
    if(!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)){
      return ContentService
        .createTextOutput('throw new Error("Callback JSONP invalido");')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(params){
  if(CONFIG.WRITE_TOKEN && String(params.token || '') !== CONFIG.WRITE_TOKEN){
    throw new Error('Token invalido. Confira API_TOKEN no app.js e WRITE_TOKEN no Code.gs.');
  }
}

function ss_(){
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function dataSheet_(){
  const ss = ss_();
  let sh = ss.getSheetByName(CONFIG.DATA_SHEET_NAME);

  if(!sh){
    sh = ss.getSheets().find(s => s.getSheetId() === CONFIG.DATA_SHEET_GID);
  }

  if(!sh) throw new Error('Aba BASE_SITE nao encontrada.');

  ensureHeaders_(sh, DATA_HEADERS);
  return sh;
}

function historySheet_(){
  const ss = ss_();
  let sh = ss.getSheetByName(CONFIG.HISTORY_SHEET_NAME);

  if(!sh) sh = ss.insertSheet(CONFIG.HISTORY_SHEET_NAME);

  ensureHeaders_(sh, HISTORY_HEADERS);
  return sh;
}

function ensureHeaders_(sh, headers){
  const range = sh.getRange(1,1,1,headers.length);
  const current = range.getValues()[0].map(v => norm_(v));
  const missing = headers.some((h,i) => current[i] !== norm_(h));

  if(missing){
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function norm_(v){
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim();
}

function headerMap_(sh){
  const lastCol = Math.max(sh.getLastColumn(), DATA_HEADERS.length);
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(norm_);
  const map = {};

  headers.forEach((h,i) => {
    if(h) map[h] = i + 1;
  });

  return map;
}

function num_(v){
  if(v === null || v === undefined) return 0;

  let s = String(v).trim().replace(/\s/g,'');

  if(!s) return 0;

  if(s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g,'').replace(',','.');
  } else {
    s = s.replace(',','.');
  }

  const n = Number(s);

  return isFinite(n) ? n : 0;
}

function listItems_(){
  const sh = dataSheet_();
  const values = sh.getDataRange().getValues();

  if(values.length <= 1) return [];

  const headers = values[0].map(norm_);
  const col = name => headers.indexOf(norm_(name));

  const cSetor = col('setor');
  const cCodigo = col('codigo');
  const cProduto = col('produto');
  const cQtd = col('qtd');
  const cMin = col('minimo');
  const cMax = col('maximo');
  const cUn = col('unidade');
  const cObs = col('observacao');

  return values.slice(1).map((r,i) => ({
    row:i+2,
    setor:String(r[cSetor] || 'GERAL').trim() || 'GERAL',
    codigo:String(r[cCodigo] || '').trim(),
    produto:String(r[cProduto] || '').trim(),
    qtd:num_(r[cQtd]),
    minimo:num_(r[cMin]),
    maximo:num_(r[cMax]),
    unidade:String(r[cUn] || '').trim(),
    observacao:String(r[cObs] || '').trim()
  })).filter(item => item.produto);
}

function listHistory_(limit){
  const sh = historySheet_();
  const lastRow = sh.getLastRow();

  if(lastRow <= 1) return [];

  const start = Math.max(2, lastRow - Number(limit || 100) + 1);
  const values = sh.getRange(start,1,lastRow-start+1,HISTORY_HEADERS.length).getDisplayValues();

  return values.reverse().map(r => ({
    data:r[0],
    tipo:r[1],
    codigo:r[2],
    produto:r[3],
    quantidade:r[4],
    saldo_anterior:r[5],
    saldo_atual:r[6],
    usuario:r[7],
    observacao:r[8]
  }));
}

function movement_(params){
  const sh = dataSheet_();
  const map = headerMap_(sh);

  const row = parseInt(params.row, 10);
  const tipo = String(params.tipo || '').toLowerCase();
  const quantidade = num_(params.quantidade || params.qtd);
  const observacao = String(params.observacao || params.obs || '').trim();

  if(!row || row < 2) throw new Error('Linha do produto invalida.');
  if(!['entrada','saida'].includes(tipo)) throw new Error('Tipo invalido. Use entrada ou saida.');
  if(quantidade <= 0) throw new Error('Quantidade precisa ser maior que zero.');

  const qtdCol = map.qtd;
  const codigoCol = map.codigo;
  const produtoCol = map.produto;

  if(!qtdCol || !produtoCol) throw new Error('Colunas qtd/produto nao encontradas.');

  const produto = String(sh.getRange(row, produtoCol).getValue() || '').trim();

  if(!produto) throw new Error('Produto nao encontrado na linha informada.');

  const codigo = codigoCol ? String(sh.getRange(row, codigoCol).getValue() || '').trim() : '';
  const atual = num_(sh.getRange(row, qtdCol).getValue());
  const novoSaldo = tipo === 'entrada' ? atual + quantidade : atual - quantidade;

  if(tipo === 'saida' && novoSaldo < 0){
    throw new Error('Saida maior que o estoque disponivel. Saldo atual: ' + atual);
  }

  sh.getRange(row, qtdCol).setValue(novoSaldo);
  appendHistory_(tipo, codigo, produto, quantidade, atual, novoSaldo, observacao);

  return {
    ok:true,
    message:'Movimentacao salva com sucesso.',
    row,
    saldo_anterior:atual,
    saldo_atual:novoSaldo
  };
}

function addItem_(params){
  const sh = dataSheet_();

  const setor = String(params.setor || 'GERAL').trim() || 'GERAL';
  const codigo = String(params.codigo || '').trim();
  const produto = String(params.produto || '').trim();
  const qtd = num_(params.qtd || params.quantidade);
  const minimo = num_(params.minimo);
  const maximo = num_(params.maximo);
  const unidade = String(params.unidade || '').trim();
  const observacao = String(params.observacao || params.obs || '').trim();

  if(!produto) throw new Error('Informe o nome do produto.');

  sh.appendRow([setor, codigo, produto, qtd, minimo, maximo, unidade, observacao]);
  appendHistory_('cadastro', codigo, produto, qtd, 0, qtd, observacao || 'Cadastro de novo item');

  return {
    ok:true,
    message:'Item cadastrado com sucesso.',
    row:sh.getLastRow()
  };
}

function appendHistory_(tipo, codigo, produto, quantidade, saldoAnterior, saldoAtual, observacao){
  const sh = historySheet_();
  let usuario = '';

  try{
    usuario = Session.getActiveUser().getEmail() || '';
  }catch(e){}

  sh.appendRow([
    new Date(),
    tipo,
    codigo,
    produto,
    quantidade,
    saldoAnterior,
    saldoAtual,
    usuario,
    observacao || ''
  ]);
}

function setup_(){
  dataSheet_();
  historySheet_();

  return {
    ok:true,
    message:'Abas conferidas e cabecalhos configurados.'
  };
}
