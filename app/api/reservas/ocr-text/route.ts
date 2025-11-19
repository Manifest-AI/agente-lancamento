import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SYSTEM_PROMPT = `Você é um especialista em OCR e deverá transcrever integralmente o conteúdo textual de documentos de turismo (e-mails, vouchers, PDFs escaneados, etc.).
Retorne APENAS o texto plano, preservando a ordem das informações e sem adicionar explicações.`;

async function fileToDataURL(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mimeType = file.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY não configurada.' },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { ok: false, error: 'Envie um arquivo válido para OCR.' },
      { status: 400 },
    );
  }

  const mimeType = fileEntry.type || 'application/octet-stream';
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { ok: false, error: 'Formato não suportado (use PNG, JPG ou PDF).' },
      { status: 415 },
    );
  }

  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'Arquivo maior que 10 MB.' },
      { status: 413 },
    );
  }

  const dataUrl = await fileToDataURL(fileEntry);
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcreva todo o texto presente no documento a seguir e retorne apenas o texto plano.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { ok: false, error: 'Resposta sem conteúdo do provedor de IA.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { ok: true, conteudo: content, model: response.model },
      { status: 200 },
    );
  } catch (error) {
    console.error('Falha ao executar OCR de texto', error);
    return NextResponse.json(
      { ok: false, error: 'Não foi possível transcrever o arquivo enviado.' },
      { status: 500 },
    );
  }
}
