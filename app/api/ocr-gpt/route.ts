import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ExtractedReservation } from '@/types/ocr-gpt';
import { normalizeExtractedReservationDates } from '@/lib/ocr/normalizeReservation';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Você é um extrator de dados especialista em reservas de turismo para um sistema chamado Agente-Lançamento.

Sua tarefa é ler o conteúdo de uma reserva (texto ou imagem OCR) e devolver
APENAS um JSON válido seguindo exatamente o schema abaixo, sem nenhum texto antes ou depois:

{
  "operadora": "string",
  "id_externo": "string",
  "data_chegada_bps": "dd/mm/aaaa",
  "data_saida_bps": "dd/mm/aaaa",
  "voo_chegada_codigo": "string",
  "voo_saida_codigo": "string",
  "hora_chegada_bps": "HH:MM",
  "hora_saida_bps": "HH:MM",
  "hotel": "string",
  "ident": "BPS | AA/TR | BUE | BUE/A | BUE/T | null",
  "regime": "PRIVATIVO | REGULAR | null",
  "passageiros": [
    {
      "nome_completo": "string",
      "primeiro_ultimo_nome": "string",
      "tipo": "ADT | CHD | INF",
      "data_nascimento": "dd/mm/aaaa | null"
    }
  ],
  "observacoes": "string | null"
}

REGRAS IMPORTANTES:
- "id_externo" deve vir do campo ID EXTERNO da reserva (não use "Id", "Id da reserva" ou "Id Externo 2").
- "data_chegada_bps" é a data em que o passageiro CHEGA em Porto Seguro.
- "data_saida_bps" é a data em que o passageiro SAI de Porto Seguro (voo de volta).
- Formato de datas: sempre "dd/mm/aaaa".
- "voo_chegada_codigo" e "voo_saida_codigo" aceitam QUALQUER companhia aérea (G3####, LA####, AD####, AR####, etc.). NÃO limite aos exemplos.
- "hora_chegada_bps" e "hora_saida_bps" devem ficar no formato "HH:MM" em 24 horas.

REGRAS ESPECÍFICAS PARA O LAYOUT INFOTRAVEL/TAIPE (SEM QUEBRAR OUTROS FORMATOS):
- Use estas orientações adicionais quando identificar que a tela segue o layout Infotravel/Taipe. Em outros modelos de reserva continue seguindo o mesmo JSON e regras gerais normalmente.
- Campo "operadora" nesses layouts:
  1. Priorize o texto exibido ao lado do rótulo "Contato", que representa a operadora responsável pela reserva.
  2. Se não houver "Contato", use o texto ao lado do rótulo "Nome" dentro da seção "Unidade", removendo qualquer código numérico ou identificador antes do nome (ex.: "12345 - Operadora X" deve virar apenas "Operadora X").
  3. Nunca use o nome do sistema/receptivo destacado no meio da página (por exemplo, o título grande do serviço/traslado) como operadora: esse texto identifica o sistema Infotravel/Taipe ou o receptivo local, não a operadora que deve ir no JSON.

REGRAS PARA O BLOCO DE INFORMAÇÕES "IDA/VOLTA" (TOOLTIP AMARELO INFOTRAVEL/TAIPE):
- Quando houver um quadro com duas linhas identificadas como "Ida" e "Volta":
  - A linha "Ida" traz companhia aérea, código do voo e a data/hora da chegada em Porto Seguro.
  - A linha "Volta" traz companhia aérea, código do voo e a data/hora da saída de Porto Seguro.
- Extraia exatamente:
  - "data_chegada_bps": data que aparece na linha "Ida".
  - "data_saida_bps": data que aparece na linha "Volta".
  - "voo_chegada_codigo": código de voo da linha "Ida".
  - "voo_saida_codigo": código de voo da linha "Volta".
  - "hora_chegada_bps": horário da linha "Ida".
  - "hora_saida_bps": horário da linha "Volta".
- Copie os valores exatamente como aparecem (inclusive zeros à esquerda) e, se não conseguir ler algum dígito com segurança, retorne null ao invés de chutar.

REGRAS ESPECÍFICAS PARA DATAS DE CHEGADA E SAÍDA:
- "data_chegada_bps" é a data em que o passageiro CHEGA em Porto Seguro.
- "data_saida_bps" é a data em que o passageiro SAI de Porto Seguro, ou seja, a data do VOO DE VOLTA.
- Quando existir um bloco de transporte com linhas "Ida" e "Volta":
  - A linha "Ida" traz a data/hora de chegada em Porto Seguro e deve ser copiada para "data_chegada_bps".
  - A linha "Volta" traz a data/hora de saída de Porto Seguro e deve ser copiada para "data_saida_bps".
- Se, além do bloco "Ida/Volta", existir um texto no formato "DATA_INICIAL até DATA_FINAL" representando o período do serviço (por exemplo, logo abaixo do título do traslado), garanta que:
  - "data_chegada_bps" corresponda exatamente à DATA_INICIAL.
  - "data_saida_bps" corresponda exatamente à DATA_FINAL.
- Em qualquer divergência entre as datas das linhas "Ida/Volta" e o intervalo "DATA_INICIAL até DATA_FINAL", escolha a combinação que faça mais sentido lógico, obedecendo SEMPRE a regra:
  - "data_chegada_bps" = menor data do período (data inicial da viagem para Porto Seguro).
  - "data_saida_bps" = maior data do período (data final da viagem, saída de Porto Seguro).
- Para identificar "data_saida_bps":
  1. Procure a data associada ao voo de retorno, normalmente indicada em um bloco com textos como "Volta", "Retorno", "Voo de saída", "Saída".
  2. Use EXCLUSIVAMENTE a data ligada ao voo de volta. NÃO use datas de campos como "Criação", "Confirmação", "Prazo", "Pagamento", "Validade" ou similares.
  3. Se houver mais de uma data próxima, selecione aquela que estiver no mesmo bloco textual do voo de volta.
- A data de chegada deve ser anterior ou igual à data de saída. Nunca retorne uma data de chegada posterior à data de saída.
- Se não for possível identificar com segurança a data de chegada ou de saída, use null em vez de inventar uma data.
- Formato de todas as datas: "dd/mm/aaaa".
- Copie as datas exatamente como são mostradas (dia, mês, ano). Nunca troque o dia, mês ou ano por outra data exibida em outro contexto da mesma tela.
- Se algum dígito estiver ilegível ou ausente (por exemplo, o dia não pode ser lido), retorne null em vez de tentar adivinhar.
- "ident" deve seguir:
  - BPS: hotel em Porto Seguro, passageiro não argentino.
  - AA/TR: hotel em Arraial d'Ajuda / Trancoso / Caraíva, passageiro não argentino.
  - BUE: passageiro argentino + hotel em Porto Seguro.
  - BUE/A: passageiro argentino + hotel em Arraial.
  - BUE/T: passageiro argentino + hotel em Trancoso.
  - Se não for possível deduzir, use null.
- No array "passageiros", inclua TODOS os passageiros encontrados na reserva (algumas reservas podem ter 20, 30, 40 ou mais passageiros).
- Para cada passageiro:
  - "nome_completo": exatamente como aparece na reserva.
  - "primeiro_ultimo_nome": apenas primeiro e último nome.
  - "tipo": ADT (≥11 anos), CHD (6–10), INF (≤5). Se só aparecer ADT/CHD/INF ou ADULTO/CRIANÇA/BEBÊ, use a sigla equivalente (ADT/CHD/INF).
- "regime" deve ser PRIVATIVO ou REGULAR, se aparecer algo indicando isso no texto (por exemplo: "SERVIÇO REGULAR", "SERVIÇO PRIVATIVO").
- Se não tiver certeza de algum valor, use null ou string vazia, NÃO invente dados.
- Retorne APENAS o JSON, sem comentários, sem explicação, sem texto antes ou depois.`;

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 25_000;
const RETRY_DELAYS_MS = [500, 1_500, 3_000];

type JsonErrorCode =
  | 'bad_request'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'openai_invalid_response'
  | 'rate_limited'
  | 'openai_upstream_error'
  | 'internal_error';

type ErrorResponsePayload = {
  ok: false;
  error: { code: JsonErrorCode; message: string; hint?: string };
  requestId: string;
};

type SuccessResponsePayload = {
  ok: true;
  data: ExtractedReservation;
  requestId: string;
  model?: string | null;
};

function makeJsonError(
  status: number,
  code: JsonErrorCode,
  message: string,
  requestId: string,
  hint?: string,
) {
  const body: ErrorResponsePayload = {
    ok: false,
    error: hint ? { code, message, hint } : { code, message },
    requestId,
  };
  return NextResponse.json(body, { status });
}

function logRouteError(code: JsonErrorCode, requestId: string, message: string, err?: unknown) {
  const errorToLog = err ?? new Error(message);
  console.error({ requestId, route: 'ocr-gpt', code, err: errorToLog });
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

async function fileToDataURL(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mimeType = file.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

async function callModelWithTimeout(
  openai: OpenAI,
  payload: Parameters<OpenAI['chat']['completions']['create']>[0],
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    return await openai.chat.completions.create(payload, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callModelWithRetry(
  openai: OpenAI,
  payload: Parameters<OpenAI['chat']['completions']['create']>[0],
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await callModelWithTimeout(openai, payload);
    } catch (error) {
      lastError = error;
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : undefined;
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      if (isAbortError) {
        break;
      }
      if (!status || ![429, 500, 502].includes(status) || attempt === RETRY_DELAYS_MS.length - 1) {
        break;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    logRouteError('missing_api_key', requestId, 'OPENAI_API_KEY não configurada.');
    return makeJsonError(401, 'missing_api_key', 'OPENAI_API_KEY não configurada.', requestId);
  }

  const formData = await request.formData();
  const textEntry = formData.get('text');
  const fileEntry = formData.get('file');

  if (textEntry && fileEntry) {
    logRouteError('bad_request', requestId, 'Envie apenas texto ou arquivo por vez.');
    return makeJsonError(400, 'bad_request', 'Envie apenas texto ou arquivo por vez.', requestId);
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  let messages: ChatCompletionMessageParam[];

  if (typeof textEntry === 'string' && textEntry.trim()) {
    const trimmedText = textEntry.trim();
    const userContent = [
      'Leia o conteúdo da reserva delimitado abaixo, aplique todas as regras do sistema e responda APENAS com o JSON solicitado.',
      '<<<RESERVA>>>',
      trimmedText,
      '<<<FIM>>>',
    ].join('\n');
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];
  } else if (fileEntry instanceof File) {
    const mimeType = fileEntry.type || 'application/octet-stream';
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      logRouteError('unsupported_media_type', requestId, 'Formato não suportado (use PNG, JPG ou PDF).');
      return makeJsonError(415, 'unsupported_media_type', 'Formato não suportado (use PNG, JPG ou PDF).', requestId);
    }
    if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
      logRouteError('payload_too_large', requestId, 'Arquivo maior que 10 MB.');
      return makeJsonError(413, 'payload_too_large', 'Arquivo maior que 10 MB.', requestId);
    }

    const dataUrl = await fileToDataURL(fileEntry);
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'A imagem a seguir contém o conteúdo integral da reserva. Leia tudo, siga exatamente o schema descrito e responda apenas com o JSON.',
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];
  } else {
    logRouteError('bad_request', requestId, 'Envie um texto ou arquivo válido para processamento.');
    return makeJsonError(400, 'bad_request', 'Envie um texto ou arquivo válido para processamento.', requestId);
  }

  try {
    const response = await callModelWithRetry(openai, {
      model,
      temperature: 0,
      messages,
    });

    if (!('choices' in response)) {
      logRouteError(
        'openai_upstream_error',
        requestId,
        'Resposta inesperada do provedor de IA (stream sem suporte).',
      );
      return makeJsonError(
        502,
        'openai_upstream_error',
        'Resposta inesperada do provedor de IA.',
        requestId,
      );
    }

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      logRouteError('openai_upstream_error', requestId, 'Resposta sem conteúdo do provedor de IA.');
      return makeJsonError(502, 'openai_upstream_error', 'Resposta sem conteúdo do provedor de IA.', requestId);
    }

    const jsonBlock = extractJsonBlock(content);
    if (!jsonBlock) {
      logRouteError('openai_invalid_response', requestId, 'Não foi possível localizar JSON válido na resposta.');
      return makeJsonError(422, 'openai_invalid_response', 'Não foi possível localizar JSON válido na resposta.', requestId);
    }

    let data: ExtractedReservation;
    try {
      data = JSON.parse(jsonBlock) as ExtractedReservation;
    } catch (error) {
      logRouteError('openai_invalid_response', requestId, 'Falha ao interpretar o JSON retornado pelo provedor.', error);
      return makeJsonError(422, 'openai_invalid_response', 'Falha ao interpretar o JSON retornado pelo provedor.', requestId);
    }

    const normalizedData = normalizeExtractedReservationDates(data);

    const successPayload: SuccessResponsePayload = {
      ok: true,
      data: normalizedData,
      requestId,
      model: response.model,
    };
    return NextResponse.json(successPayload, { status: 200 });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : undefined;
    const hint = error instanceof Error && error.name === 'AbortError' ? 'timeout' : undefined;

    if (hint === 'timeout') {
      logRouteError('openai_upstream_error', requestId, 'Timeout ao consultar o provedor de IA.', error);
      return makeJsonError(502, 'openai_upstream_error', 'Timeout ao consultar o provedor de IA.', requestId, 'timeout');
    }

    if (status === 401) {
      logRouteError('invalid_api_key', requestId, 'Chave da OpenAI inválida.', error);
      return makeJsonError(401, 'invalid_api_key', 'Chave da OpenAI inválida.', requestId);
    }

    if (status === 429) {
      logRouteError('rate_limited', requestId, 'Limite de requisições excedido pelo provedor de IA.', error);
      return makeJsonError(429, 'rate_limited', 'Limite de requisições excedido pelo provedor de IA.', requestId);
    }

    if (status === 500 || status === 502) {
      logRouteError('openai_upstream_error', requestId, 'Falha temporária ao consultar o provedor de IA.', error);
      return makeJsonError(502, 'openai_upstream_error', 'Falha temporária ao consultar o provedor de IA.', requestId);
    }

    if (status && status >= 400 && status < 500) {
      logRouteError('bad_request', requestId, 'Falha na solicitação ao provedor de IA.', error);
      return makeJsonError(status, 'bad_request', 'Falha na solicitação ao provedor de IA.', requestId);
    }

    logRouteError('internal_error', requestId, 'Erro interno ao processar a solicitação.', error);
    return makeJsonError(500, 'internal_error', 'Erro interno ao processar a solicitação.', requestId);
  }
}
