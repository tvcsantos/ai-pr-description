import { OpenAI } from 'openai'
import type { AIProvider, ChatCompletionRequest } from './provider.js'

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL })
  }

  async generateChatCompletion(
    request: ChatCompletionRequest
  ): Promise<string | undefined> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens
    })
    return response.choices[0]?.message.content ?? undefined
  }
}
