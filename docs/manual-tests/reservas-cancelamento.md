# Testes manuais de cancelamento e remoção de passageiros

Estes testes validam que os endpoints que atualizam `reservas.status` usam o valor aceito pelo tipo/enum do banco (`Cancelado`) e não geram erro do Supabase.

## Pré-requisitos
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` configuradas (use `env.local`).
- Um token de sessão válido (`Authorization: Bearer <token>`) para o usuário dono das reservas envolvidas.
- Uma reserva existente com `numero_reserva` conhecido e, para o teste de remoção parcial, com passageiros múltiplos.

## Cancelamento total via `/api/reservas/cancelar`
1. Execute:
   ```bash
   curl -i -X POST "http://localhost:3000/api/reservas/cancelar" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"numeroReserva":"<NUMERO>","escopo":"total"}'
   ```
2. Verifique resposta `200` e `stats.cancelados` igual ao número de registros.
3. Confirme no Supabase que os registros tiveram `status = "Cancelado"` e que nenhuma mensagem de enum inválido apareceu.

## Remoção de passageiro via `/api/reservas/alterar`
1. Monte payload removendo um nome existente:
   ```bash
   curl -i -X POST "http://localhost:3000/api/reservas/alterar" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"numeroReserva":"<NUMERO>","removePassengers":[{"nome":"<NOME_EXISTENTE>"}]}'
   ```
2. Verifique resposta `200` e `stats.removed` > 0.
3. Confirme no Supabase que o passageiro removido foi atualizado para `status = "Cancelado"` sem erro de enum.

Se qualquer chamada retornar 500 com mensagem relacionada a enum de status, investigar o valor enviado no payload e o tipo da coluna `status` na tabela `reservas`.
