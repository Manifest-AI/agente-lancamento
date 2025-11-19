import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type ExtractedCancellationPassenger = {
  nome: string | null;
  tipo_pax: 'ADT' | 'CHD' | 'INF' | null;
  documento?: string | null;
};

export type ExtractedCancellation = {
  tipo_documento: 'cancelamento';
  referencia_reserva: {
    numero_reserva: string | null;
    id_externo: string | null;
    operadora: string | null;
    plataforma: string | null;
  };
  escopo: 'total' | 'parcial';
  passageiros: ExtractedCancellationPassenger[] | null;
  trechos_afetados: Array<{ descricao: string; data?: string | null }> | null;
  observacoes: string | null;
};

const CANCELLATION_SYSTEM_PROMPT = `Você é um especialista em reservas de turismo focado em DOCUMENTOS DE CANCELAMENTO.

Leia o conteúdo integral de um e-mail/documento e retorne APENAS um JSON válido seguindo o formato abaixo:
{
  "tipo_documento": "cancelamento",
  "referencia_reserva": {
    "numero_reserva": "string | null",
    "id_externo": "string | null",
    "operadora": "string | null",
    "plataforma": "string | null"
  },
  "escopo": "total | parcial",
  "passageiros": [
    {
      "nome": "string | null",
      "tipo_pax": "ADT | CHD | INF | null",
      "documento": "string | null"
    }
  ],
  "trechos_afetados": [
    {
      "descricao": "string",
      "data": "dd/mm/aaaa | null"
    }
  ],
  "observacoes": "string | null"
}

REGRAS IMPORTANTES:
- "tipo_documento" deve ser SEMPRE "cancelamento".
- Preencha "numero_reserva" quando houver qualquer identificação clara da reserva (número, localizador, código).
- "escopo": use "total" quando todo o grupo/reserva foi cancelado, senão "parcial".
- Liste cada passageiro citado explicitamente. Se o documento mencionar "todos" ou não especificar, retorne um array vazio e use "escopo": "total".
- "trechos_afetados" deve listar voos/serviços específicos mencionados como cancelados.
- "observacoes" deve trazer qualquer instrução adicional relevante (políticas, prazos, taxas).
- NÃO explique o raciocínio. NÃO retorne nada além do JSON final.`;

function extractJsonBlock(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

export async function extractCancellationFromText(openai: OpenAI, model: string, conteudo: string) {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: CANCELLATION_SYSTEM_PROMPT },
    { role: 'user', content: conteudo },
  ];

  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages,
  });

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Resposta sem conteúdo do provedor de IA.');
  }

  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) {
    throw new Error('Não foi possível localizar JSON válido na resposta.');
  }

  try {
    return JSON.parse(jsonBlock) as ExtractedCancellation;
  } catch (error) {
    throw new Error('Falha ao interpretar o JSON retornado pelo provedor.');
  }
}
