# Controle Financeiro Interno

Sistema web independente para controle interno de notas fiscais, despesas e depósitos, com o objetivo de evitar extravios e substituir os relatórios mantidos em Excel.

## Escopo inicial

### Notas fiscais

- Fornecedor
- Data de emissão
- Número da nota
- Um ou mais vencimentos
- Leitura da chave de acesso pelo código de barras
- Busca da nota em todos os períodos

### Despesas

- Nome da despesa
- Data da despesa
- Valor da despesa
- Data da baixa
- Total calculado apenas para o período aberto

### Depósitos

- Data do depósito
- Valor do depósito
- Depositante opcional
- Total calculado apenas para o período aberto

## Períodos

- Notas fiscais, despesas e depósitos possuem períodos independentes.
- Cada módulo pode ter somente um período aberto por vez.
- Períodos encerrados permanecem disponíveis no histórico.
- Um período encerrado pode ser reaberto para correção.
- Registros antigos podem ser localizados por pesquisa.

## Status

Repositório inicial criado para o desenvolvimento da nova aplicação. A definição da interface e da arquitetura será feita antes da implementação do primeiro módulo.

