# PRISMA — Gestão FaF e FaFt

Interface aprovada do Festival Arte em Foco, com acesso da administradora, dos jurados e dos apoiadores.

As imagens originais foram extraídas do HTML, sem alterações. Os dados das inscrições e os e-mails dos usuários ficam no banco protegido, fora do código público. A autenticação não usa senhas locais.

## Ativação

1. Aplicar `supabase/migrations/20261008190000_prisma_access.sql` no projeto Supabase destinado ao PRISMA.
2. Preencher `config.js` com a URL do projeto e a chave publicável. A chave de serviço nunca deve ir no site ou no GitHub.
3. Definir a URL do site nas URLs de redirecionamento do Supabase Auth.
4. Executar `scripts/provision.mjs` em ambiente confiável com a importação privada, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `PRISMA_SITE_URL`. O script cria os perfis e gera os links de primeiro acesso sem enviar mensagens.
5. A administradora distribui os links. Cada pessoa define sua própria senha; o perfil é determinado no banco e não pode ser alterado pelo cliente.
6. A administradora atribui as apresentações na tabela `prisma_assignments`. Jurados e apoiadores recebem apenas as apresentações que lhes foram atribuídas e salvam somente as próprias notas.

Sem configurar o projeto, o sistema mantém as áreas protegidas e informa que a autenticação aguarda conexão. GitHub hospeda o código; Supabase autentica os usuários e protege os dados.

## Verificação

`node --test tests/*.test.cjs`

Os testes locais verificam bloqueio sem sessão, acesso por perfil, navegação e integração das chamadas. A execução das políticas SQL e os acessos com contas reais devem ser verificados no projeto Supabase após a ativação.
