import { TEXT_MODEL } from '../constants';
import { DocumentSection, FilePayload } from '../types';
import { getAiClient } from './geminiService';

const guessMimeType = (file: File): string => {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const explicit = file.type;

  if (['md', 'markdown', 'mdown'].includes(ext)) return 'text/markdown';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  // EPUB is a zip container; Gemini rejects application/epub+zip, so use octet-stream.
  if (ext === 'epub' || explicit === 'application/epub+zip') return 'application/octet-stream';

  return explicit || 'application/octet-stream';
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
};

export const buildFilePayload = async (file: File): Promise<FilePayload> => {
  const base64 = await readFileAsBase64(file);
  return {
    base64,
    mimeType: guessMimeType(file),
    name: file.name,
  };
};

const fallbackSections = (summary?: string): DocumentSection[] => [
  {
    id: 'full',
    title: 'Full document',
    summary: summary || 'Single pass narration of the uploaded file.',
    cue: 'Full document',
  },
];

const coerceSections = (parsed: any): DocumentSection[] => {
  const rawSections = Array.isArray(parsed?.sections)
    ? parsed.sections
    : Array.isArray(parsed)
      ? parsed
      : [];

  const sections = rawSections
    .map((section: unknown, index: number): DocumentSection | null => {
      if (typeof section === 'string') {
        return {
          id: `${index}-${section.substring(0, 64)}`,
          title: section,
          cue: section,
        };
      }
      if (!section || typeof section !== 'object') return null;
      const title = (section as any).title || (section as any).heading || (section as any).name;
      if (!title) return null;
      return {
        id: `${index}-${String(title).substring(0, 64)}`,
        title,
        summary: (section as any).summary,
        cue: (section as any).cue ?? title,
      };
    })
    .filter((section: DocumentSection | null): section is DocumentSection => Boolean(section));

  return sections;
};

const extractResponseText = async (response: any): Promise<string | undefined> => {
  if (typeof response?.text === 'function') {
    const textValue = response.text();
    if (typeof textValue === 'string') return textValue;
    if (textValue && typeof textValue.then === 'function') {
      return await textValue;
    }
  }
  if (typeof response?.text === 'string') {
    return response.text;
  }
  const parts =
    response?.candidates?.[0]?.content?.parts ??
    response?.response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const textPart = parts.find((part: any) => typeof part?.text === 'string');
    return textPart?.text;
  }
  return undefined;
};

const normalizeJsonText = (text: string): string => {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  const firstJsonStart =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);
  const lastJsonEnd =
    lastBrace === -1
      ? lastBracket
      : lastBracket === -1
        ? lastBrace
        : Math.max(lastBrace, lastBracket);
  if (firstJsonStart !== -1 && lastJsonEnd !== -1 && lastJsonEnd > firstJsonStart) {
    cleaned = cleaned.slice(firstJsonStart, lastJsonEnd + 1);
  }
  return cleaned;
};

export const analyzeDocumentOutline = async (
  payload: FilePayload,
  apiKey: string
): Promise<DocumentSection[]> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `
You are assisting with creating a listening playlist from a document upload (PDF, EPUB, or Markdown).
File name: ${payload.name}. Treat EPUB as a ZIP container with XHTML/HTML content inside.
Look for natural sections such as a table of contents, chapters, headings, or executive summaries without deeply reading the full text.
Return ONLY valid JSON (no markdown, no commentary).
Schema: {"sections":[{"title":"...","summary":"...","cue":"..."}]}.
- Prefer existing section titles/headings.
- Keep summaries under 30 words.
- Limit to 15 sections.
- If no structure exists, return exactly: {"sections":[{"title":"Full document","summary":"No clear headings detected.","cue":"Full document"}]}.`,
          },
          { inlineData: { data: payload.base64, mimeType: payload.mimeType } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });

  const text = await extractResponseText(response);
  if (!text) {
    return fallbackSections('No outline data returned; narrate the full document.');
  }

  try {
    const parsed = JSON.parse(normalizeJsonText(text));
    const sections = coerceSections(parsed);
    if (sections.length === 0) {
      return fallbackSections('No clear headings detected; narrate the full document.');
    }
    return sections;
  } catch (error) {
    console.warn(
      'Unable to parse outline response; falling back to full document.',
      error,
      text.slice(0, 1200)
    );
    return fallbackSections('Outline parsing failed; narrate the full document.');
  }
};

export const extractSectionTextFromFile = async (
  payload: FilePayload,
  sectionTitle: string,
  apiKey: string
): Promise<string> => {
  const ai = getAiClient(apiKey);
  const normalizedTitle = sectionTitle.trim();
  const isFullDocument =
    normalizedTitle.toLowerCase() === 'full document' ||
    normalizedTitle.toLowerCase().startsWith('full document');
  const prompt = isFullDocument
    ? `
Using the attached document, extract the primary narrative text of the document.
File name: ${payload.name}. If this is an EPUB, unzip and read the XHTML/HTML chapters.
- Do not summarize; provide verbatim text with paragraphs separated by blank lines.
- Keep output under 1,800 words to stay TTS friendly.
- If the document is extremely long, return the strongest continuous portion from the beginning.`
    : `
Using the attached document, extract only the text for the section titled "${normalizedTitle}".
File name: ${payload.name}. If this is an EPUB, unzip and read the XHTML/HTML chapters to find the section.
- If there is a close match or subsection, choose the best fit.
- Do not summarize; provide verbatim text with paragraphs separated by blank lines.
- Keep output under 1,800 words to stay TTS friendly.
- If the section is missing, return the strongest available portion that matches the cue.`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: payload.base64, mimeType: payload.mimeType } },
        ],
      },
    ],
    config: {
      maxOutputTokens: 3072,
      temperature: 0.4,
    },
  });

  const text = await extractResponseText(response);
  if (!text) {
    throw new Error('Gemini could not extract that section.');
  }

  return text;
};
