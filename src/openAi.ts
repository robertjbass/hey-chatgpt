import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function prompt(question: string) {
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: `${question}?` }],
    model: "gpt-4o",
  });

  return chatCompletion.choices[0]?.message?.content || "";
}
