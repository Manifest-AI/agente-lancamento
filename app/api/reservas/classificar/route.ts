import { NextResponse } from 'next/server';
import OpenAI from 'openai';

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
  data: ClassifierResult;
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

  try {
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
      return makeErrorResponse(502, 'Resposta sem conteúdo do provedor de IA.');
    }

    const jsonBlock = extractJsonBlock(content);
    if (!jsonBlock) {
      return makeErrorResponse(502, 'Não foi possível localizar JSON válido na resposta.');
    }

    let data: ClassifierResult;
    try {
      data = JSON.parse(jsonBlock) as ClassifierResult;
    } catch (error) {
      return makeErrorResponse(502, 'Falha ao interpretar o JSON retornado pelo provedor.');
    }

    const payload: SuccessResponse = {
      ok: true,
      data,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : undefined;
    return makeErrorResponse(500, 'Falha ao consultar o provedor de IA.', details);
  }
}
