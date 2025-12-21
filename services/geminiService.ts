import { GoogleGenAI, Modality } from "@google/genai";
import { TTS_MODEL, TEXT_MODEL } from '../constants';

/**
 * Creates a new instance of the GoogleGenAI client.
 */
export const getAiClient = (apiKey: string | undefined) => {
  // Use the passed key, or fall back to process.env if available (for dev environments)
  const key = apiKey || (typeof process !== 'undefined' ? process.env.API_KEY : undefined);
  if (!key) throw new Error("API Key is missing");
  return new GoogleGenAI({ apiKey: key });
};

/**
 * Extracts clean text content from a given URL using Gemini's search grounding capabilities.
 */
export const extractTextFromUrl = async (url: string, apiKey: string): Promise<string> => {
  try {
    const prompt = `
      Please visit the following URL: ${url}
      
      Your task is to extract the main article content from this page.
      - Ignore navigation menus, footers, ads, and sidebars.
      - Return ONLY the full body text of the article.
      - Do not summarize. Preserve the original flow and detail.
      - If the page is not an article, describe the main content visible.
    `;

    const ai = getAiClient(apiKey);

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text content returned from extraction model.");
    }
    return text;
  } catch (error) {
    console.error("Error extracting text:", error);
    throw error;
  }
};

/**
 * Generates speech audio (PCM) for a given text segment.
 */
export const generateSpeechChunk = async (text: string, voiceName: string, apiKey: string): Promise<string> => {
  try {
    const ai = getAiClient(apiKey);

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data returned from TTS model.");
    }

    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};
