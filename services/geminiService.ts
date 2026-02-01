
import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
  
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Creates a comprehensive "Character Bible" by analyzing the full script and avatar metadata.
 */
export async function createCharacterBible(filenames: string[], fullScript: string): Promise<string> {
    const prompt = `I am producing a high-stakes film. I need a master "Character Bible" for consistency.
    
    ASSET LIST (AVATARS): ${filenames.join(', ')}
    
    FULL SCRIPT EXCERPT:
    ${fullScript.substring(0, 15000)}
    
    TASK:
    1. EXHAUSTIVE ANALYSIS: For every character in the script, define their visual blueprint: skin tone, hair texture, distinct facial features (sharp jaw, hooked nose, etc.), and their signature "vibe" (neurotic, imposing, deceptive).
    2. ASSET MAPPING: Map the provided filenames to these characters. Be logical. If 'avatar_boss.png' exists, it matches the 'Boss' character. 
    3. STYLE KEY: Note their unique dialogue patterns to help infer physical performance.
    
    Format this as a technical production document for visual effects artists.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", // Use Pro for the bible creation
            contents: prompt,
        });
        return response.text || "Character Bible generation failed.";
    } catch (error) {
        console.error("Error creating Bible:", error);
        return "Error creating Character Bible.";
    }
}

/**
 * Analyzes the visual content of a rough draft scene image.
 */
export async function analyzeSceneImage(base64: string, mimeType: string): Promise<string> {
    const prompt = "DECONSTRUCT THIS FRAME: Describe the exact lighting setup (e.g., chiaroscuro, high-key), the camera lens feel, the character's current pose/silhouette, and the environment. Identify the exact emotional state of the character in the frame.";
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview", // Flash 3 is great for vision
            contents: {
                parts: [
                    { inlineData: { data: base64, mimeType } },
                    { text: prompt }
                ]
            }
        });
        return response.text || "Visual analysis unavailable.";
    } catch (error) {
        return "Image analysis failed.";
    }
}

/**
 * Maps the identified scene subject to the character bible and consistent avatar.
 */
export async function identifyConsistentCharacter(
    sceneText: string, 
    sceneVisualAnalysis: string, 
    characterBible: string
): Promise<{ characterName: string; avatarFilename: string | null; otherCharacters?: string[] }> {
    const prompt = `[CROSS-REFERENCE REQUEST]
    
    CONTEXT:
    SCENE DIALOGUE/ACTION: "${sceneText}"
    VISUAL DATA FROM ROUGH FRAME: "${sceneVisualAnalysis}"
    
    MASTER BIBLE:
    ${characterBible.substring(0, 8000)}
    
    OUTPUT JSON ONLY:
    {
      "characterName": "Who is the primary subject currently on screen?",
      "avatarFilename": "Which filename from the Bible represents this person?",
      "otherCharacters": ["Who else is in the scene contextually?"],
      "reasoning": "Brief technical justification."
    }`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });
        const result = JSON.parse(response.text || '{}');
        return { 
            characterName: result.characterName || "Unknown", 
            avatarFilename: result.avatarFilename || null,
            otherCharacters: result.otherCharacters || []
        };
    } catch (error) {
        return { characterName: "Unknown", avatarFilename: null };
    }
}

/**
 * Generates the final rejuvenation prompt using the bible, context, and visual gap analysis.
 */
export async function generateRejuvenatedPrompt(
    sceneText: string, 
    characterName: string, 
    otherCharacters: string[],
    bible: string, 
    style: string,
    visualAnalysis: string,
    fullScriptSnippet: string,
    storyMap: string | null
): Promise<string> {
    const prompt = `[CINEMATIC RECONSTRUCTION INSTRUCTION - NANO BANANA OPTIMIZED]
    
    STORY ENGINE DATA:
    - PLOT PROGRESSION: ${storyMap || "Standard narrative arc."}
    - CURRENT ACTION/DIALOGUE: ${sceneText}
    - FULL CONTEXT: ${fullScriptSnippet.substring(0, 1500)}
    
    VISUAL PARAMETERS:
    - TARGET IDENTITY: ${characterName} (Reference Bible traits: ${bible.substring(0, 1000)})
    - ORIGINAL FRAME COMPOSITION: ${visualAnalysis}
    - REQUIRED STYLE: ${style}
    
    TASK: Write a prompt for a high-end image diffusion model (Gemini 2.5 Image).
    1. EMOTION INFERENCE: Determine the EXACT micro-expression required (e.g., "twitching eye in repressed rage", "a cold, calculating smirk").
    2. DESTRUCTIVE REPLACEMENT: Instruct the model to RECODE the face. Specify the skin texture, the light hitting the specific bone structure of ${characterName}.
    3. CINEMATOGRAPHY: Force specific lens traits (e.g. "Anamorphic bokeh, subtle halation, 35mm celluloid grit").
    4. TONALITY: Match the 'action, tone, and emotion' of the script.
    
    Output ONLY the final prompt. No conversation.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: prompt,
        });
        return response.text?.trim() || "Masterpiece film frame, cinematic lighting, ultra-detailed characters.";
    } catch (error) {
        return "Cinematic film frame, professional lighting.";
    }
}

/**
 * Core revision: Aggressive Subject replacement using 2.5 Flash Image.
 */
export async function generateRevisedImage(
    prompt: string,
    avatarBase64: string | null,
    avatarMime: string | null,
    sceneBase64: string,
    sceneMime: string,
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '16:9'
): Promise<{ imageBase64: string | null }> {
    const parts: any[] = [];
    
    if (avatarBase64 && avatarMime) {
        // Interleaved, unambiguous instructions for the identity transplant.
        parts.push({ text: `[PROMPT] ${prompt}` });
        parts.push({ text: `\n\n[INSTRUCTION] This is an IDENTITY TRANSPLANT. Use the AVATAR image as the *only* source for the person's identity. Use the SCENE image for pose, lighting, and composition. Replace the person in the SCENE with the person from the AVATAR.` });
        parts.push({ text: `\n\nAVATAR (Identity Source):` });
        parts.push({ inlineData: { data: avatarBase64, mimeType: avatarMime } });
        parts.push({ text: `\n\nSCENE (Composition Source):` });
        parts.push({ inlineData: { data: sceneBase64, mimeType: sceneMime } });
    } else {
        // Fallback for when no avatar is provided.
        const instruction = `TASK: CINEMATIC RE-RENDER.
           - Enhance the following image based on this style: ${prompt}
           - OUTPUT: A single, high-fidelity, color film frame.`;
        parts.push({ text: instruction });
        parts.push({ inlineData: { data: sceneBase64, mimeType: sceneMime } });
    }
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: { imageConfig: { aspectRatio } },
        });

        let imageBase64: string | null = null;
        const partsOut = response.candidates?.[0]?.content?.parts;
        if (partsOut) {
            for (const p of partsOut) {
                if (p.inlineData?.data) {
                    imageBase64 = p.inlineData.data;
                    break;
                }
            }
        }
        return { imageBase64 };
    } catch (error) {
        console.error("Revision Error:", error);
        return { imageBase64: null };
    }
}
