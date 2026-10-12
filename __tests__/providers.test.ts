import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatCompletionRequest } from '../src/ai/provider.js'

type Response = { choices: { message: { content?: string | null } }[] }
const create =
  jest.fn<
    (request: {
      model: string
      messages: ChatCompletionRequest['messages']
      max_tokens: number
      temperature: number
    }) => Promise<Response>
  >()
const OpenAI = jest.fn(function (options: {
  apiKey: string
  baseURL?: string
}) {
  return { chat: { completions: { create } } }
})
const AzureOpenAI = jest.fn(function (options: {
  apiKey: string
  endpoint: string
  apiVersion: string
}) {
  return { chat: { completions: { create } } }
})
jest.unstable_mockModule('openai', () => ({ OpenAI, AzureOpenAI }))
const { createAIProvider, aiProviderConfigurationSchema } =
  await import('../src/ai/provider-factory.js')

const request: ChatCompletionRequest = {
  model: 'model',
  messages: [{ role: 'user', content: 'Describe this diff' }],
  maxTokens: 100,
  temperature: 0.6
}

describe('AI providers', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({
      choices: [{ message: { content: 'Description' } }]
    })
  })

  it('selects OpenAI explicitly even with Azure settings present', () => {
    createAIProvider(
      aiProviderConfigurationSchema.parse({
        provider: 'openai',
        apiKey: 'key',
        endpoint: 'https://example.com',
        apiVersion: 'version'
      })
    )
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      baseURL: undefined
    })
    expect(AzureOpenAI).not.toHaveBeenCalled()
  })

  it('configures Azure from its specific settings', () => {
    createAIProvider({
      provider: 'azure-openai',
      apiKey: 'key',
      endpoint: 'https://example.com',
      apiVersion: 'version'
    })
    expect(AzureOpenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      endpoint: 'https://example.com',
      apiVersion: 'version'
    })
    expect(OpenAI).not.toHaveBeenCalled()
  })

  it('uses an already parsed configuration without parsing again', () => {
    const configuration = aiProviderConfigurationSchema.parse({
      provider: 'openai',
      apiKey: 'key',
      baseURL: 'https://api.example.com/v1'
    })
    const parse = jest.spyOn(aiProviderConfigurationSchema, 'parse')
    try {
      createAIProvider(configuration)
      expect(parse).not.toHaveBeenCalled()
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'key',
        baseURL: 'https://api.example.com/v1'
      })
    } finally {
      parse.mockRestore()
    }
  })

  it.each([
    {},
    { provider: 'unknown', apiKey: 'key' },
    { provider: 'openai', apiKey: '' },
    {
      provider: 'azure-openai',
      apiKey: 'key',
      endpoint: 'invalid',
      apiVersion: 'version'
    },
    {
      provider: 'azure-openai',
      apiKey: 'key',
      endpoint: 'https://example.com',
      apiVersion: ''
    }
  ])(
    'rejects invalid configuration before constructing a client: %j',
    (config) => {
      expect(() => aiProviderConfigurationSchema.parse(config)).toThrow()
      expect(OpenAI).not.toHaveBeenCalled()
      expect(AzureOpenAI).not.toHaveBeenCalled()
    }
  )

  describe.each(['openai', 'azure-openai'])('%s adapter', (provider) => {
    function adapter() {
      return createAIProvider(
        aiProviderConfigurationSchema.parse({
          provider,
          apiKey: 'key',
          endpoint: 'https://example.com',
          apiVersion: 'version'
        })
      )
    }

    it('maps the neutral request to SDK parameters', async () => {
      await expect(adapter().generateChatCompletion(request)).resolves.toBe(
        'Description'
      )
      expect(create).toHaveBeenCalledWith({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature
      })
    })

    it.each<Response>([
      { choices: [] },
      { choices: [{ message: { content: null } }] },
      { choices: [{ message: {} }] }
    ])('normalizes missing content to undefined: %j', async (response) => {
      create.mockResolvedValue(response)
      await expect(
        adapter().generateChatCompletion(request)
      ).resolves.toBeUndefined()
    })

    it('leaves blank-content validation to the orchestrator', async () => {
      create.mockResolvedValue({ choices: [{ message: { content: '' } }] })
      await expect(adapter().generateChatCompletion(request)).resolves.toBe('')
    })

    it('propagates SDK errors', async () => {
      create.mockRejectedValue(new Error('API unavailable'))
      await expect(adapter().generateChatCompletion(request)).rejects.toThrow(
        'API unavailable'
      )
    })
  })
})
