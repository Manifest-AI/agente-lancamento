import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export const runtime = 'nodejs';

export type AlterationFieldChange = {
  tipo: 'alteracao_campo';
  campo:
    | 'data_chegada_bps'
    | 'data_saida_bps'
    | 'voo_chegada_codigo'
    | 'voo_saida_codigo'
    | 'hotel'
    | 'regime'
    | 'ident'
    | 'outro';
  de: string | null;
  para: string | null;
};

export type AlterationPassengerChange =
  | {
      tipo: 'adicionar_pax';
      nome: string | null;
      tipo_pax: 'ADT' | 'CHD' | 'INF' | null;
      quantidade: number;
    }
  | {
      tipo: 'remover_pax';
      nome: string | null;
      tipo_pax: 'ADT' | 'CHD' | 'INF' | null;
      quantidade: number;
    };

export type AlterationServiceChange =
  | {
      tipo: 'adicionar_servico';
      descricao: string;
      data: string | null;
    }
  | {
      tipo: 'remover_servico';
      descricao: string;
      data: string | null;
    };

export type AlterationChange =
  | AlterationFieldChange
  | AlterationPassengerChange
  | AlterationServiceChange;

export type ExtractedAlteration = {
  tipo_documento: 'alteracao';
  referencia_reserva: {
    numero_reserva: string | null;
    id_externo: string | null;
    operadora: string | null;
    plataforma: string | null;
  };
  mudancas: AlterationChange[];
  observacoes: string | null;
};

const ALTERATION_SYSTEM_PROMPT = `Você é um especialista em reservas de turismo focado em DOCUMENTOS DE ALTERAÇÃO DE RESERVA.

Sua tarefa é ler o conteúdo completo de um email ou documento de alteração de reserva (não é uma confirmação nova, e sim uma mudança em algo já reservado) e devolver APENAS um JSON válido que descreva qual reserva deve ser alterada e quais mudanças precisam ser aplicadas.

Formato EXATO do JSON de saída:
{
  "tipo_documento": "alteracao",
  "referencia_reserva": {
    "numero_reserva": "string | null",
    "id_externo": "string | null",
    "operadora": "string | null",
    "plataforma": "string | null"
  },
  "mudancas": [
    {
      "tipo": "alteracao_campo",
      "campo": "data_chegada_bps | data_saida_bps | voo_chegada_codigo | voo_saida_codigo | hotel | regime | ident | outro",
      "de": "string | null",
      "para": "string | null"
    },
    {
      "tipo": "adicionar_pax",
      "nome": "string | null",
      "tipo_pax": "ADT | CHD | INF | null",
      "quantidade": 1
    },
    {
      "tipo": "remover_pax",
      "nome": "string | null",
      "tipo_pax": "ADT | CHD | INF | null",
      "quantidade": 1
    },
    {
      "tipo": "adicionar_servico",
      "descricao": "string",
      "data": "dd/mm/aaaa | null"
    },
    {
      "tipo": "remover_servico",
      "descricao": "string",
      "data": "dd/mm/aaaa | null"
    }
  ],
  "observacoes": "string | null"
}

REGRAS IMPORTANTES:
- "tipo_documento" deve ser SEMPRE "alteracao".
- Preencha os campos de "referencia_reserva" apenas quando aparecerem claramente no texto; use null caso contrário.
- Liste cada mudança separadamente no array "mudancas" usando o tipo adequado.
- Use "alteracao_campo" para mudanças diretas nos campos da reserva.
- "adicionar_pax"/"remover_pax" para inclusão ou remoção de passageiros (sem inventar nomes se não estiverem presentes).
- "adicionar_servico"/"remover_servico" para serviços extras, passeios ou traslados.
- Quando não houver valor anterior claro, retorne "de": null e apenas informe o valor novo em "para".
- "observacoes" deve trazer um resumo em texto livre ou ser null se não houver algo relevante.
- Não explique o raciocínio, não invente dados e não retorne nada além do JSON final.`;

type ErrorResponse = {
  ok: false;
  error: string;
  details?: Record<string, unknown>;
};

type SuccessResponse = {
  ok: true;
  data: ExtractedAlteration;
};

function makeErrorResponse(status: number, message: string, details?: Record<string, unknown>) {
  const payload: ErrorResponse = {
    ok: false,
    error: message,
    ...(details ? { details } : {}),
  };
  return NextResponse.json(payload, { status });
}

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

export async function extractAlterationFromText(openai: OpenAI, model: string, conteudo: string) {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: ALTERATION_SYSTEM_PROMPT },
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
    return JSON.parse(jsonBlock) as ExtractedAlteration;
  } catch (error) {
    throw new Error('Falha ao interpretar o JSON retornado pelo provedor.');
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return makeErrorResponse(400, 'Corpo da requisição deve ser um JSON válido.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return makeErrorResponse(400, 'Corpo da requisição deve ser um JSON com o campo "conteudo".');
  }

  const conteudo = typeof (body as { conteudo?: unknown }).conteudo === 'string'
    ? (body as { conteudo: string }).conteudo.trim()
    : '';

  if (!conteudo) {
    return makeErrorResponse(400, 'conteudo obrigatório');
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return makeErrorResponse(500, 'OPENAI_API_KEY não configurada.');
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  try {
    const data = await extractAlterationFromText(openai, model, conteudo);
    const payload: SuccessResponse = { ok: true, data };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : undefined;
    return makeErrorResponse(500, 'falha ao extrair alteração', details);
  }
}
