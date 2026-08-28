# Controle Financeiro Interno — Top Haus

Sistema web privado para substituir os relatórios internos de notas fiscais, despesas e depósitos.

## O que o sistema controla

- **Notas fiscais:** fornecedor, emissão, número, chave de acesso opcional e um ou mais vencimentos.
- **Despesas:** descrição, data, valor e data de baixa opcional.
- **Depósitos:** data, valor e depositante opcional.
- **Períodos independentes:** cada relatório pode ser aberto e encerrado separadamente.
- **Histórico:** períodos encerrados continuam pesquisáveis e podem ser reabertos.
- **Reenvio de notas:** uma nota antiga pode ser incluída novamente no período atual sem perder o registro original.
- **Totais corretos:** despesas e depósitos somam somente o período aberto.

## Uso local

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Validação

```bash
npm run build
```

Os dados são armazenados em banco D1. A publicação é configurada como privada para uso interno.
