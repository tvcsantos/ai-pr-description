import { AzureOpenAI } from 'openai'
import type { AIProvider, ChatCompletionRequest } from './provider.js'

export class AzureOpenAIProvider implements AIProvider {
  private readonly client: AzureOpenAI

  constructor(apiKey: string, endpoint: string, apiVersion: string) {
    this.client = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion
    })
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
