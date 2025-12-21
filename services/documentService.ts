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
  if (ext === 'epub') return 'application/octet-stream';

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

const extractResponseText = (response: any): string | undefined => {
  if (typeof response?.text === 'function') {
    return response.text();
  }
  if (typeof response?.text === 'string') {
    return response.text;
  }
  return response?.candidates?.[0]?.content?.parts?.[0]?.text;
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
Return a concise JSON payload: {"sections":[{"title":"...","summary":"...","cue":"..."}]}.
- Prefer existing section titles/headings.
- Keep summaries under 30 words.
- Limit to 15 sections.
- If no structure exists, return a single "Full document" section with an informative summary.`,
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

  const text = extractResponseText(response);
  if (!text) throw new Error('Gemini returned no outline data.');

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Unable to parse outline from Gemini response.');
  }

  const sections: DocumentSection[] = Array.isArray(parsed?.sections)
    ? parsed.sections
        .filter((section: any) => section?.title)
        .map((section: any, index: number) => ({
          id: `${index}-${section.title.substring(0, 64)}`,
          title: section.title,
          summary: section.summary,
          cue: section.cue ?? section.title,
        }))
    : [];

  if (sections.length === 0) {
    return [
      {
        id: 'full',
        title: 'Full document',
        summary: 'Single pass narration of the uploaded file.',
      },
    ];
  }

  return sections;
};

export const extractSectionTextFromFile = async (
  payload: FilePayload,
  sectionTitle: string,
  apiKey: string
): Promise<string> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `
Using the attached document, extract only the text for the section titled "${sectionTitle}".
File name: ${payload.name}. If this is an EPUB, unzip and read the XHTML/HTML chapters to find the section.
- If there is a close match or subsection, choose the best fit.
- Do not summarize; provide verbatim text with paragraphs separated by blank lines.
- Keep output under 1,800 words to stay TTS friendly.
- If the section is missing, return the strongest available portion that matches the cue.`,
          },
          { inlineData: { data: payload.base64, mimeType: payload.mimeType } },
        ],
      },
    ],
    config: {
      maxOutputTokens: 3072,
      temperature: 0.4,
    },
  });

  const text = extractResponseText(response);
  if (!text) {
    throw new Error('Gemini could not extract that section.');
  }

  return text;
};
