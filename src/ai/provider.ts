export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionRequest = {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  temperature: number
}

export interface AIProvider {
  generateChatCompletion(
    request: ChatCompletionRequest
  ): Promise<string | undefined>
}
