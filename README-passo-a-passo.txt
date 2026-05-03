PASSO A PASSO - CONTROLE DE ESTOQUE V2

ESTRUTURA DO PROJETO
controle-estoque-v2/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── assets/
│   └── .keep
└── google-apps-script/
    └── Code.gs

O QUE ESTA VERSAO FAZ
- Consulta produtos da aba BASE_SITE.
- Permite dar entrada.
- Permite dar saida.
- Permite cadastrar novo item.
- Atualiza a quantidade direto na planilha.
- Cria/usa uma aba HISTORICO para registrar movimentacoes.
- Gera lista de compras automatica.

COMO ATIVAR ENTRADA, SAIDA E NOVO ITEM
1. Abra sua planilha Google.
2. Clique em Extensoes > Apps Script.
3. Apague o codigo que estiver em Code.gs.
4. Cole o conteudo do arquivo google-apps-script/Code.gs.
5. Salve.
6. Clique em Implantar > Nova implantacao.
7. Selecione Tipo: App da Web.
8. Em Executar como, escolha: Eu.
9. Em Quem tem acesso, escolha: Qualquer pessoa.
10. Clique em Implantar.
11. Autorize o acesso.
12. Copie a URL que termina com /exec.
13. Abra js/app.js.
14. Troque:
    const API_URL = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT';
    pela URL copiada.
15. Suba index.html, css, js e assets para o GitHub.

OBSERVACAO IMPORTANTE
Se voce atualizar o Apps Script depois, use Implantar > Gerenciar implantacoes > Editar > Nova versao.
Se criar uma nova implantacao, talvez a URL mude e voce precise atualizar js/app.js.


URL DO APPS SCRIPT CONFIGURADA
https://script.google.com/macros/s/AKfycbz1iQYll-ASvzM4GWgwHdajdSLtlksELApTlBK_ToVOifTZyqovalC6_BVGCnBrcfyKbA/exec

Agora envie para o GitHub:
- index.html
- pasta css
- pasta js
- pasta assets

Nao precisa enviar a pasta google-apps-script para o site.


============================================
URL DO APPS SCRIPT ATUALIZADA
============================================
https://script.google.com/macros/s/AKfycbwj5eSU_eRywgZU2W1tAEPmkxpOsrwFl2qHdjA9mRrN59qwgQ2hFbbiBVIHVaOJcIqkaA/exec

Use esta pasta/ZIP para substituir os arquivos do GitHub:
- index.html
- css/
- js/
- assets/

A pasta google-apps-script fica apenas como backup do backend.
