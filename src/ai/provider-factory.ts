import { z } from 'zod/v4'
import { AzureOpenAIProvider } from './azure-openai-provider.js'
import { OpenAIProvider } from './openai-provider.js'
import type { AIProvider } from './provider.js'

const openAIProviderConfigurationSchema = z.object({
  provider: z.literal('openai'),
  apiKey: z.string().min(1),
  baseURL: z.url().optional()
})

const azureOpenAIProviderConfigurationSchema = z.object({
  provider: z.literal('azure-openai'),
  apiKey: z.string().min(1),
  endpoint: z.url(),
  apiVersion: z.string().min(1)
})

export const aiProviderConfigurationSchema = z.discriminatedUnion('provider', [
  openAIProviderConfigurationSchema,
  azureOpenAIProviderConfigurationSchema
])

export type AIProviderConfiguration = z.infer<
  typeof aiProviderConfigurationSchema
>

export function createAIProvider(
  configuration: AIProviderConfiguration
): AIProvider {
  switch (configuration.provider) {
    case 'openai':
      return new OpenAIProvider(configuration.apiKey, configuration.baseURL)
    case 'azure-openai':
      return new AzureOpenAIProvider(
        configuration.apiKey,
        configuration.endpoint,
        configuration.apiVersion
      )
  }
}
