// Gera o Apps Script que o João cola na planilha. Ele manda ao CRM cada linha cuja
// coluna "CRM" ainda está vazia e escreve o resultado ali ("ok", "duplicado", erro).
export function buildAppsScript({ url, key }) {
	return `// Envia as linhas novas desta planilha para o CRM do Paraíso das Plantas.
// Não mexa na coluna "CRM": é nela que o resultado de cada linha aparece.
const CRM_URL = ${JSON.stringify(url)};
const CRM_KEY = ${JSON.stringify(key)};
const ABA = ''; // vazio = primeira aba; ou escreva o nome da aba
const LOTE = 50;

function enviarNovasLinhas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ABA ? planilha.getSheetByName(ABA) : planilha.getSheets()[0];
    if (!aba || aba.getLastRow() < 2) return;
    const largura = aba.getLastColumn();
    const cabecalho = aba.getRange(1, 1, 1, largura).getValues()[0].map(String);
    let colunaCrm = cabecalho.indexOf('CRM') + 1;
    if (!colunaCrm) {
      colunaCrm = largura + 1;
      aba.getRange(1, colunaCrm).setValue('CRM');
      cabecalho.push('CRM');
    }
    const fim = Date.now() + 4 * 60 * 1000;
    while (Date.now() < fim) {
      const total = aba.getLastRow();
      const dados = aba.getRange(2, 1, total - 1, colunaCrm).getValues();
      const lote = [];
      for (let i = 0; i < dados.length && lote.length < LOTE; i++) {
        const linha = dados[i];
        const vazia = linha.slice(0, colunaCrm - 1).every((c) => c === '' || c === null);
        if (!vazia && linha[colunaCrm - 1] === '') {
          const data = {};
          cabecalho.forEach((nome, j) => {
            if (nome && nome !== 'CRM' && linha[j] !== '') data[nome] = String(linha[j]);
          });
          lote.push({ row: i + 2, data: data });
        }
      }
      if (!lote.length) return;
      const resposta = UrlFetchApp.fetch(CRM_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + CRM_KEY },
        payload: JSON.stringify({ rows: lote }),
        muteHttpExceptions: true
      });
      if (resposta.getResponseCode() !== 200) {
        aba.getRange(lote[0].row, colunaCrm).setValue('erro ' + resposta.getResponseCode() + ': tente de novo');
        return;
      }
      const resultados = JSON.parse(resposta.getContentText()).results || [];
      resultados.forEach((r) => {
        const texto = r.status === 'CRIADO' ? 'ok' : r.status === 'DUPLICADO' ? 'ja existia' : 'erro: ' + (r.reason || r.status);
        aba.getRange(r.row, colunaCrm).setValue(texto);
      });
    }
  } finally {
    lock.releaseLock();
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CRM').addItem('Enviar linhas novas agora', 'enviarNovasLinhas').addToUi();
}
`;
}
