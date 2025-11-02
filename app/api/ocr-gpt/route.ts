import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ExtractedReservation } from '@/types/ocr-gpt';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Você extrai dados de reservas (prints/sistemas de operadoras como Taípe).
Retorne SOMENTE JSON válido. Datas YYYY-MM-DD, horas HH:mm.
Campos:
- operadora
- data_chegada_bps
- data_saida_bps
- ident (BPS | AA/TR | BUE | BUE/A | BUE/T)
- voo_chegada (ex: "LA 3600")
- voo_saida (ex: "LA 3601")
- hora_chegada
- hora_saida
- hotel
- id_reserva   // use sempre o "ID Externo" quando houver
- nome         // apenas primeiro e último
- tipo         // A (>=11), C (6–10), I (<=5)
- observacao   // "Privativo" se for privativo; "" se REGULAR
Regras IDENT:
- Hotel em Porto Seguro → BPS
- Hotel em Arraial/Trancoso/Caraíva → AA/TR
- Passageiro argentino em Porto Seguro → BUE
- Argentino em Arraial → BUE/A ; em Trancoso → BUE/T
Se um campo não constar, use null. Não invente valores.`;

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY não configurada.' }, { status: 500 });
  }

  const formData = await request.formData();
  const textEntry = formData.get('text');
  const fileEntry = formData.get('file');

  if (textEntry && fileEntry) {
    return badRequest('Envie apenas texto ou arquivo por vez.');
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  let messages: ChatCompletionMessageParam[];

  if (typeof textEntry === 'string' && textEntry.trim()) {
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: textEntry.trim() },
    ];
  } else if (fileEntry instanceof File) {
    if (!SUPPORTED_MIME_TYPES.includes(fileEntry.type)) {
      return badRequest('Formato não suportado. Utilize PNG, JPG, JPEG ou PDF.');
    }
    if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
      return badRequest('Arquivo muito grande. Limite de 10MB.');
    }

    const dataUrl = await fileToDataURL(fileEntry);
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extraia e normalize conforme regras.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];
  } else {
    return badRequest('Envie um texto ou arquivo válido para processamento.');
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Resposta sem conteúdo.' }, { status: 502 });
    }

    const jsonBlock = extractJsonBlock(content);
    if (!jsonBlock) {
      return NextResponse.json({ ok: false, error: 'Não foi possível localizar o JSON na resposta.' }, { status: 502 });
    }

    let data: ExtractedReservation;
    try {
      data = JSON.parse(jsonBlock) as ExtractedReservation;
    } catch (error) {
      return NextResponse.json({ ok: false, error: 'Falha ao interpretar o JSON retornado.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, data, model: response.model });
  } catch (error) {
    console.error('Erro na chamada à OpenAI', error);
    return NextResponse.json({ ok: false, error: 'Erro ao consultar o modelo de extração.' }, { status: 502 });
  }
}
