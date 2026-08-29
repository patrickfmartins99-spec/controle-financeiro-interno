# Controle Financeiro Interno — Top Haus

Sistema web responsivo para substituir os controles internos de notas fiscais, despesas e depósitos.

## Recursos

- Períodos independentes para cada relatório.
- Totais de despesas e depósitos somente do período aberto.
- Notas fiscais com um ou mais vencimentos.
- Leitura da chave da nota pela câmera em navegadores compatíveis.
- Histórico pesquisável e reabertura de períodos.
- Reenvio de notas antigas sem apagar o registro original.
- Interface mobile-first com navegação adaptada para telefone, tablet e computador.
- Dados persistentes com Netlify Blobs.

## Desenvolvimento local

```bash
npm install
npm run dev
```

O comando inicia o ambiente local da Netlify e disponibiliza também o armazenamento de testes. Os dados locais são separados da produção.

## Publicação na Netlify

1. No painel da Netlify, escolha **Add new project** e depois **Import an existing project**.
2. Conecte o repositório `patrickfmartins99-spec/controle-financeiro-interno`.
3. A Netlify reconhecerá o arquivo `netlify.toml` automaticamente.
4. Confirme a implantação.

Antes de registrar dados reais, ative a proteção de acesso do projeto nas configurações da Netlify. O sistema já solicita aos mecanismos de busca que não indexem suas páginas, mas essa configuração de acesso é o que restringe efetivamente os visitantes.

Configuração detectada:

- Build: `npm run build`
- Publicação: `.next`
- Node.js: versão 22

O armazenamento Netlify Blobs é criado automaticamente no primeiro uso; não exige banco externo nem variável secreta.

## Validação

```bash
npm run lint
npm run build
```
