import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { InputOptions } from '@actions/core'

let values: Record<string, string>
const getInput = jest.fn((name: string, options?: InputOptions): string => {
  const value = values[name] ?? ''
  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return value
})
jest.unstable_mockModule('@actions/core', () => ({ getInput }))
const { getInputs } = await import('../src/inputs.js')

describe('inputs', () => {
  beforeEach(() => {
    values = {
      'github-token': 'github-key',
      'openai-api-key': 'ai-key',
      'openai-base-url': '',
      'openai-model': 'chosen-model',
      provider: 'openai'
    }
  })

  it('reads every input and applies defaults', () => {
    expect(getInputs()).toEqual({
      aiProviderConfiguration: {
        provider: 'openai',
        apiKey: 'ai-key',
        baseURL: undefined
      },
      githubToken: 'github-key',
      openAIApiKey: 'ai-key',
      openAIBaseURL: undefined,
      provider: 'openai',
      pullRequestId: undefined,
      allowedUsers: [],
      openAIModel: 'chosen-model',
      maxTokens: 1000,
      temperature: 0.6,
      samplePrompt: '',
      sampleResponse: '',
      completionPrompt: '',
      overwriteDescription: false,
      outputMode: 'description',
      commentMode: 'update',
      azureEndpoint: '',
      azureOpenAIApiVersion: ''
    })
  })

  it('parses configured values', () => {
    Object.assign(values, {
      provider: 'azure-openai',
      'pull-request-id': '42',
      'allowed-users': ' alice, , bob ',
      'openai-model': 'deployment',
      'max-tokens': '250',
      temperature: '2',
      'sample-prompt': 'sample',
      'sample-response': 'response',
      'completion-prompt': 'completion',
      'overwrite-description': 'TRUE',
      'azure-endpoint': 'https://example.openai.azure.com',
      'azure-openai-api-version': '2024-10-21'
    })
    expect(getInputs()).toMatchObject({
      aiProviderConfiguration: {
        provider: 'azure-openai',
        apiKey: 'ai-key',
        endpoint: 'https://example.openai.azure.com',
        apiVersion: '2024-10-21'
      },
      provider: 'azure-openai',
      pullRequestId: 42,
      allowedUsers: ['alice', 'bob'],
      openAIModel: 'deployment',
      maxTokens: 250,
      temperature: 2,
      samplePrompt: 'sample',
      sampleResponse: 'response',
      completionPrompt: 'completion',
      overwriteDescription: true,
      azureEndpoint: 'https://example.openai.azure.com',
      azureOpenAIApiVersion: '2024-10-21'
    })
  })

  it('passes the optional OpenAI base URL to provider configuration', () => {
    values['openai-base-url'] = 'https://api.example.com/v1'
    expect(getInputs()).toMatchObject({
      openAIBaseURL: 'https://api.example.com/v1',
      aiProviderConfiguration: {
        provider: 'openai',
        apiKey: 'ai-key',
        baseURL: 'https://api.example.com/v1'
      }
    })
  })

  it.each(['github-token', 'openai-api-key', 'openai-model', 'provider'])(
    'requires %s',
    (name) => {
      values[name] = ''
      expect(() => getInputs()).toThrow(
        `Input required and not supplied: ${name}`
      )
    }
  )

  it.each(['0', '-1', '1.5', '12abc', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid PR number %s',
    (value) => {
      values['pull-request-id'] = value
      expect(() => getInputs()).toThrow(
        'pull-request-id must be a positive integer'
      )
    }
  )

  it.each(['0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992'])(
    'rejects invalid token count %s',
    (value) => {
      values['max-tokens'] = value
      expect(() => getInputs()).toThrow('max-tokens must be a positive integer')
    }
  )

  it.each(['-0.1', '2.1', 'NaN', 'Infinity', 'abc'])(
    'rejects invalid temperature %s',
    (value) => {
      values.temperature = value
      expect(() => getInputs()).toThrow(
        'temperature must be a number between 0 and 2'
      )
    }
  )

  it.each(['0', '2'])('accepts temperature boundary %s', (value) => {
    values.temperature = value
    expect(getInputs().temperature).toBe(Number(value))
  })

  it('accepts an explicit false boolean', () => {
    values['overwrite-description'] = 'FALSE'
    expect(getInputs().overwriteDescription).toBe(false)
  })

  it('accepts comment output mode', () => {
    values['output-mode'] = 'comment'
    expect(getInputs().outputMode).toBe('comment')
  })

  it('rejects an invalid OpenAI base URL', () => {
    values['openai-base-url'] = 'not-a-url'
    expect(() => getInputs()).toThrow()
  })

  it('rejects unsupported output modes', () => {
    values['output-mode'] = 'unknown'
    expect(() => getInputs()).toThrow()
  })

  it.each(['update', 'create'])('accepts comment mode %s', (mode) => {
    values['comment-mode'] = mode
    expect(getInputs().commentMode).toBe(mode)
  })

  it('rejects unsupported comment modes', () => {
    values['comment-mode'] = 'unknown'
    expect(() => getInputs()).toThrow()
  })

  it('rejects unsupported boolean and provider values', () => {
    values['overwrite-description'] = 'yes'
    expect(() => getInputs()).toThrow(
      'overwrite-description must be true or false'
    )
    values['overwrite-description'] = 'false'
    values.provider = 'unknown'
    expect(() => getInputs()).toThrow()
  })

  it.each([
    { 'azure-endpoint': '', 'azure-openai-api-version': '2024-10-21' },
    { 'azure-endpoint': 'not-a-url', 'azure-openai-api-version': '2024-10-21' },
    { 'azure-endpoint': 'https://example.com', 'azure-openai-api-version': '' }
  ])('requires valid Azure settings: %j', (settings) => {
    Object.assign(values, { provider: 'azure-openai' }, settings)
    expect(() => getInputs()).toThrow()
  })
})
