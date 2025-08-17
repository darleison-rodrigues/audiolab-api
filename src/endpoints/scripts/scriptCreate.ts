import { OpenAPIRoute, contentJson, ApiException } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { extractText, getDocumentProxy } from "unpdf";

async function extractTextFromPdf(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const document = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(document, { mergePages: true });
    return text.trim();
  } catch (error: any) {
    console.error("Error extracting text from PDF:", error);
    throw new ApiException(`Failed to process PDF from url: ${url}. ${error.message}`, 400);
  }
}

export class ScriptCreate extends OpenAPIRoute {
  public schema = {
    tags: ["Scripts"],
    summary: "Create a new Script from a PDF URL",
    request: {
      body: contentJson(
        z.object({
          name: z.string(),
          url: z.string().url(),
          personas: z.array(z.string()).min(1),
        }),
      ),
    },
    responses: {
      "201": {
        description: "Returns the created script",
        ...contentJson({
          success: z.boolean(),
          result: z.object({
            id: z.number(),
            name: z.string(),
            r2_file_link: z.string(),
            created_at: z.string(),
            personas: z.string(),
          }),
        }),
      },
      "400": {
        description: "Bad Request - e.g., invalid URL or PDF processing failed",
        ...contentJson({
          success: z.boolean(),
          errors: z.array(z.object({ code: z.number(), message: z.string() })),
        }),
      },
      "500": {
        description: "Internal Server Error - e.g., AI model or R2 failed",
        ...contentJson({
          success: z.boolean(),
          errors: z.array(z.object({ code: z.number(), message: z.string() })),
        }),
      },
    },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { name, url, personas } = data.body;

    // 1. Extract text from the PDF
    const articleText = await extractTextFromPdf(url);

    if (!articleText || articleText.trim().length === 0) {
      throw new ApiException("Could not extract text from the provided PDF.", 400);
    }

    const MAX_TURNS = 10; // Limit the number of turns to avoid excessive generation
    const TOKENS_PER_TURN = 512; // Control output tokens per persona

    let fullScriptContent = '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.w3.org/WAI/TR/2018/wcag21/syn-speech-api#command">';
    let conversationHistory: string[] = [];

    // Helper to generate a response for a single persona
    const generatePersonaResponse = async (persona: string, currentTurn: number): Promise<string> => {
      const personaPrompt = `
        You are ${persona}. Based on the article text and the conversation so far, generate your next line of dialogue in SSML format.
        Keep your response concise, within ${TOKENS_PER_TURN} tokens, and relevant to the discussion.
        Ensure your response is enclosed in a <voice name="${persona}"> tag and includes <prosody> tags for expressive speech.
        Article Text: ${articleText.substring(0, 5000)}
        Conversation History:\n${conversationHistory.join('\n')}
        Your Turn (${currentTurn}/${MAX_TURNS}):
      `;

      console.log(`AI Prompt for ${persona}:\n`, personaPrompt);

      try {
        const response = await c.env.AI.run("@cf/mistral/mistral-7b-instruct-v0.1", {
          prompt: personaPrompt,
          stream: false,
          max_tokens: TOKENS_PER_TURN,
        });
        console.log(`Full AI response for ${persona}:`, JSON.stringify(response, null, 2));
        return response.response || '';
      } catch (error: any) {
        console.error(`Error calling Workers AI for ${persona}:`, error);
        return ''; // Return empty string on error
      }
    };

    // 1. Narrator Introduction
    const narratorPrompt = `
      As a narrator, provide a brief introduction to a podcast episode based on the following article.
      The introduction should be in SSML format, enclosed in a <voice name="Narrator"> tag, and include <prosody> tags.
      Article Text: ${articleText.substring(0, 2000)}
    `;
    console.log("AI Prompt for Narrator:\n", narratorPrompt);
    try {
      const narratorResponse = await c.env.AI.run("@cf/mistral/mistral-7b-instruct-v0.1", {
        prompt: narratorPrompt,
        stream: false,
        max_tokens: 256,
      });
      console.log("Full AI response for Narrator:", JSON.stringify(narratorResponse, null, 2));
      const intro = narratorResponse.response || '';
      fullScriptContent += intro;
      conversationHistory.push(intro);
    } catch (error: any) {
      console.error("Error generating narrator intro:", error);
      // Continue without intro if it fails
    }

    // 2. Iterative Dialogue Generation
    for (let i = 0; i < MAX_TURNS; i++) {
      const currentPersona = personas[i % personas.length]; // Round-robin personas
      const personaDialogue = await generatePersonaResponse(currentPersona, i + 1);
      if (personaDialogue) {
        fullScriptContent += personaDialogue;
        conversationHistory.push(personaDialogue);
      } else {
        // If a persona fails to generate, stop the conversation
        console.warn(`Persona ${currentPersona} failed to generate a response. Ending conversation.`);
        break;
      }
    }

    fullScriptContent += '</speak>';

    // 3. Upload the script to R2
    const r2_file_link = `generated/${Date.now()}-${name.replace(/\s+/g, "-")}.ssml`;
    try {
      await c.env.R2_BUCKET.put(r2_file_link, fullScriptContent);
    } catch (error: any) {
      console.error("Error uploading to R2:", error);
      throw new ApiException("Failed to store generated script in R2.", 500);
    }

    // 4. Save metadata to D1
    const personasJson = JSON.stringify(personas);
    try {
      const info = await c.env.DB.prepare(
        "INSERT INTO scripts (name, r2_file_link, personas) VALUES (?, ?, ?) RETURNING id, name, r2_file_link, created_at, personas",
      )
        .bind(name, r2_file_link, personasJson)
        .first();

      c.status(201);
      return {
        success: true,
        result: info,
      };
    } catch (error: any) {
      console.error("Error inserting into D1:", error);
      // Attempt to delete the orphaned R2 file
      try {
        await c.env.R2_BUCKET.delete(r2_file_link);
      } catch (deleteError) {
        console.error("Error cleaning up orphaned R2 file:", deleteError);
      }
      throw new ApiException("Failed to save script metadata to the database.", 500);
    }
  }
}