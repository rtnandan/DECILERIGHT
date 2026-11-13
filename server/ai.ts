import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { EmailMessage, Lead } from "../src/lib/types";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured in the environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export async function generateAiIcebreakers(
  leads: Pick<Lead, "id" | "first_name" | "last_name" | "company" | "designation" | "industry" | "custom_fields">[],
  aiContext: string,
): Promise<{ id: string; line: string }[]> {
  const ai = getGeminiClient();
  const leadDescriptions = leads.map((l) => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name}`.trim(),
    role: l.designation,
    company: l.company,
    industry: l.industry,
    extra: l.custom_fields,
  }));

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Generate one natural, specific, human-sounding cold email opening line ({{ai_line}}) for each contact below.
Return strictly one concise sentence per contact (12–24 words), no generic flattery ("I hope this finds you well"), no emojis, no exclamation marks.

Sender context: ${aiContext || "DECILE Media, a B2B editorial and growth studio."}

Contacts:
${JSON.stringify(leadDescriptions, null, 2)}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "The lead id passed in." },
            line: { type: Type.STRING, description: "One-sentence personalized cold email opening line." },
          },
          required: ["id", "line"],
        },
      },
    },
  });

  const text = (response.text ?? "[]").trim();
  const parsed = JSON.parse(text) as { id: string; line: string }[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function draftEmailCopy(input: {
  brief: string;
  kind: "email" | "follow_up" | "reply";
  tone: string;
  context: string;
}): Promise<{ subject: string; body: string; subjectIdeas: string[] }> {
  const ai = getGeminiClient();

  const kindGuide =
    input.kind === "email"
      ? "Write an initial cold email (60-120 words) plus a crisp subject line and 4 alternative subject lines."
      : input.kind === "follow_up"
        ? "Write a brief, polite follow-up step (40-85 words) referencing the previous email without repeating everything."
        : "Write a warm, clear inbox reply (45-100 words) moving the conversation toward a next step.";

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `${kindGuide}

Available merge variables: {{first_name|there}}, {{company}}, {{designation}}, {{industry}}, {{ai_line}}.
Strict deliverability rules:
- No exclamation marks in subject lines
- No sales spam triggers ("free", "discount", "act now", "100%", "guarantee")
- No links unless explicitly asked in the brief
- No sign-off name (the mailbox signature is appended automatically)

Tone: ${input.tone || "warm, direct, peer-to-peer"}
About the sender: ${input.context || "DECILE Media, a B2B editorial and demand studio."}

Brief:
${input.brief}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: "Primary subject line (empty string if follow_up or reply)." },
          body: { type: Type.STRING, description: "Email body copy with optional merge variables." },
          subjectIdeas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "4 concise alternative subject lines for testing.",
          },
        },
        required: ["subject", "body", "subjectIdeas"],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? "{}").trim()) as {
    subject?: string;
    body?: string;
    subjectIdeas?: string[];
  };

  return {
    subject: String(parsed.subject ?? "").trim().slice(0, 200),
    body: String(parsed.body ?? "").trim().slice(0, 6000),
    subjectIdeas: Array.isArray(parsed.subjectIdeas) ? parsed.subjectIdeas.slice(0, 5) : [],
  };
}

export async function draftThreadReply(input: {
  lead: Pick<Lead, "first_name" | "last_name" | "company" | "designation" | "industry">;
  messages: Pick<EmailMessage, "direction" | "body" | "created_at">[];
  instruction: string;
  context: string;
}): Promise<string> {
  const ai = getGeminiClient();

  const transcript = input.messages
    .map((m) => `[${m.direction.toUpperCase()} - ${m.created_at.slice(0, 10)}]\n${m.body}`)
    .join("\n\n---\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Draft a crisp, human reply to ${input.lead.first_name} ${input.lead.last_name} (${input.lead.designation} at ${input.lead.company}).
Do NOT include a subject line or sign-off signature (signature is added automatically). Keep it concise (40-90 words).

Sender context: ${input.context}
Goal / instruction: ${input.instruction || "Acknowledge their reply warmly and propose a clear next step."}

Conversation history:
${transcript}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  return (response.text ?? "").trim();
}
