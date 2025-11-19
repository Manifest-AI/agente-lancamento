import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ExtractedReservation } from '@/types/ocr-gpt';
import { normalizeExtractedReservationDates } from '@/lib/ocr/normalizeReservation';
import type { ExtractedAlteration } from '@/lib/reservas/alteracao';
import { extractAlterationFromText } from '@/lib/reservas/alteracao';

export const runtime = 'nodejs';

const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador especializado em documentos de turismo (reservas de hotel, traslado, passeios, e-mails de alteração/cancelamento, etc.).

Sua tarefa é ler o CONTEÚDO COMPLETO de um documento (texto de e-mail, texto extraído de PDF ou OCR) e devolver APENAS um JSON válido com o seguinte formato:

{
  "tipo_documento": "reserva_inicial | alteracao | cancelamento | outro",
  "formato": "texto_email | texto_pdf | imagem_ocr | outro",
  "idioma": "pt | es | outro",
  "operadora_provavel": "infotravel | orinter | brt | argentina | desconhecida",
  "canal": "agencia | operadora | cliente_final | desconhecido",
  "confianca_global": 0.0
}

REGRAS:
- "tipo_documento":
  - Use "reserva_inicial" quando o documento for claramente uma CONFIRMAÇÃO de reserva (voucher, confirmação de operadora, etc.).
  - Use "alteracao" quando o foco do documento for alterar uma reserva existente (mudança de data, voo, inclusão/exclusão de passageiro, inclusão de passeio, etc.).
  - Use "cancelamento" quando o documento informar principalmente o CANCELAMENTO da reserva.
  - Use "outro" para orçamentos, propostas, trocas de e-mails que não sejam confirmação, alteração ou cancelamento.

- "formato":
  - "texto_email" quando o conteúdo parecer corpo de e-mail (com saudações, assinatura, histórico de mensagens).
  - "texto_pdf" quando o texto parecer extraído de um voucher PDF ou documento formatado (muitos blocos, títulos, colunas).
  - "imagem_ocr" quando houver muitos ruídos de OCR (quebras estranhas, espaçamentos incorretos etc.).
  - "outro" se não for possível classificar.

- "idioma":
  - "pt" para documentos predominantemente em português.
  - "es" para documentos predominantemente em espanhol.
  - "outro" para qualquer outro idioma ou mistura indecidível.

- "operadora_provavel":
  - Use o cabeçalho, rodapé, domínios de e-mail, logos e textos para inferir "infotravel", "orinter", "brt", "argentina" (operadoras argentinas em geral) ou "desconhecida" quando não tiver confiança suficiente.
  - Não invente nomes de operadoras; se não reconhecer, use "desconhecida".

- "canal":
  - "agencia": comunicações entre agência e operadora, ou entre agências.
  - "operadora": comunicações enviadas diretamente por uma operadora.
  - "cliente_final": mensagens vindas do próprio passageiro/cliente.
  - "desconhecido" quando não ficar claro.

- "confianca_global":
  - Um número de 0.0 a 1.0 representando o quão confiante você está na classificação como um todo.
  - Valores mais altos significam maior confiança.

IMPORTANTE:
- NÃO explique o raciocínio.
- NÃO retorne texto fora do JSON.
- Retorne APENAS o JSON final.`;

const EXTRACTOR_SYSTEM_PROMPT = `Você é um extrator de dados especialista em reservas de turismo para um sistema chamado Agente-Lançamento.

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

type ClassifierResult = {
  tipo_documento: 'reserva_inicial' | 'alteracao' | 'cancelamento' | 'outro';
  formato: 'texto_email' | 'texto_pdf' | 'imagem_ocr' | 'outro';
  idioma: 'pt' | 'es' | 'outro';
  operadora_provavel: 'infotravel' | 'orinter' | 'brt' | 'argentina' | 'desconhecida';
  canal: 'agencia' | 'operadora' | 'cliente_final' | 'desconhecido';
  confianca_global: number;
};

type ErrorResponse = {
  ok: false;
  error: string;
  details?: Record<string, unknown>;
};

type SuccessResponse = {
  ok: true;
  classificacao: ClassifierResult;
  reserva: ExtractedReservation | null;
  suportado: boolean;
  alteracao?: ExtractedAlteration | null;
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

async function classifyDocument(openai: OpenAI, model: string, conteudo: string) {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
      { role: 'user', content: conteudo },
    ],
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
    return JSON.parse(jsonBlock) as ClassifierResult;
  } catch (error) {
    throw new Error('Falha ao interpretar o JSON retornado pelo provedor.');
  }
}

async function extractReservationFromText(openai: OpenAI, model: string, conteudo: string) {
  const userContent = [
    'Leia o conteúdo da reserva delimitado abaixo, aplique todas as regras do sistema e responda APENAS com o JSON solicitado.',
    '<<<RESERVA>>>',
    conteudo,
    '<<<FIM>>>',
  ].join('\n');

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Resposta sem conteúdo do provedor de IA.');
  }

  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) {
    throw new Error('Não foi possível localizar JSON válido na resposta.');
  }

  try {
    return JSON.parse(jsonBlock) as ExtractedReservation;
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
    return makeErrorResponse(400, 'O campo "conteudo" é obrigatório e não pode ser vazio.');
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return makeErrorResponse(500, 'OPENAI_API_KEY não configurada.');
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  let classificacao: ClassifierResult;
  try {
    classificacao = await classifyDocument(openai, model, conteudo);
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : undefined;
    return makeErrorResponse(500, 'falha ao classificar documento', details);
  }

  if (classificacao.tipo_documento === 'alteracao') {
    try {
      const alteration = await extractAlterationFromText(openai, model, conteudo);
      const payload: SuccessResponse = {
        ok: true,
        classificacao,
        reserva: null,
        alteracao: alteration,
        suportado: true,
      };
      return NextResponse.json(payload, { status: 200 });
    } catch (error) {
      const details = error instanceof Error ? { message: error.message } : undefined;
      return makeErrorResponse(500, 'falha ao extrair alteração', details);
    }
  }

  if (classificacao.tipo_documento !== 'reserva_inicial') {
    const payload: SuccessResponse = {
      ok: true,
      classificacao,
      reserva: null,
      suportado: false,
    };
    return NextResponse.json(payload, { status: 200 });
  }

  try {
    const extracted = await extractReservationFromText(openai, model, conteudo);
    const normalized = normalizeExtractedReservationDates(extracted);
    const payload: SuccessResponse = {
      ok: true,
      classificacao,
      reserva: normalized,
      suportado: true,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : undefined;
    return makeErrorResponse(500, 'falha ao extrair reserva', details);
  }
}
