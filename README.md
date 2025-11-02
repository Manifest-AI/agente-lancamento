# Agente de Lançamento
MVP para automação de lançamentos.

## Variáveis de ambiente

A autenticação utiliza Supabase. Configure os valores abaixo conforme o ambiente:

| Variável | Descrição | Produção | Homolog/Desenvolvimento |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase. | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon). | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave *service role* usada para confirmar usuários automaticamente. | ✅ | ✅ |
| `REQUIRE_EMAIL_CONFIRMATION` | Controla a necessidade de confirmação de e-mail. `true` mantém o fluxo atual, `false` libera acesso imediato. | `true` | `false` |
| `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` (opcional) | Replica a flag no cliente quando necessário. | `true` | `false` |
| `INTERNAL_API_SECRET` | Segredo utilizado para proteger a rota interna de auto-confirmação. | Defina um valor seguro. | Pode utilizar um valor simples. |

> **Kill switch:** defina `REQUIRE_EMAIL_CONFIRMATION=true` (e opcionalmente `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=true`) para voltar a exigir confirmação de e-mail imediatamente.
