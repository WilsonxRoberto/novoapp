CORRECAO DO ERRO: Failed to fetch

O erro acontecia porque o GitHub Pages chamava o Google Apps Script com fetch().
Em alguns casos o navegador bloqueia por CORS/redirecionamento do ContentService.

Esta versao usa JSONP:
- O app.js carrega a resposta do Apps Script por uma tag <script>.
- O Code.gs responde com callback(...dados...) quando recebe o parametro callback.
- Isso evita o erro Failed to fetch em site estatico.

PASSO A PASSO

1. No Apps Script:
   - Abra Extensoes > Apps Script.
   - Apague tudo do Code.gs.
   - Cole o conteudo do arquivo google-apps-script/Code.gs desta versao.
   - Salve.

2. Atualize a implantacao:
   - Implantar > Gerenciar implantacoes.
   - Clique no lapis da implantacao atual.
   - Em Versao, escolha Nova versao.
   - Confirme:
     Executar como: Voce
     Quem tem acesso: Qualquer pessoa
   - Clique em Implantar.

3. No GitHub:
   - Substitua estes arquivos/pastas:
     index.html
     css/
     js/
     assets/

4. Teste:
   - Abra o site.
   - Clique em Atualizar.
   - Teste entrada/saida com quantidade pequena.

URL configurada no app.js:
https://script.google.com/macros/s/AKfycbwj5eSU_eRywgZU2W1tAEPmkxpOsrwFl2qHdjA9mRrN59qwgQ2hFbbiBVIHVaOJcIqkaA/exec
