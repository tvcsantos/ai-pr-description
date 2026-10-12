import * as core from '@actions/core'
import { z } from 'zod/v4'
import { aiProviderConfigurationSchema } from './ai/provider-factory.js'

const outputModeSchema = z.enum(['description', 'comment'])
const commentModeSchema = z.enum(['update', 'create'])

function positiveIntegerSchema(input: string) {
  const error = `${input} must be a positive integer`
  return z
    .number({ error })
    .refine((value) => Number.isSafeInteger(value) && value > 0, { error })
}

const inputsSchema = z.object({
  aiProviderConfiguration: aiProviderConfigurationSchema,
  githubToken: z.string().min(1),
  openAIApiKey: z.string().min(1),
  openAIBaseURL: z.url().optional(),
  provider: z.enum(['openai', 'azure-openai']),
  pullRequestId: positiveIntegerSchema('pull-request-id').optional(),
  allowedUsers: z.array(z.string()),
  openAIModel: z.string().min(1),
  maxTokens: positiveIntegerSchema('max-tokens'),
  temperature: z
    .number({
      error: 'temperature must be a number between 0 and 2'
    })
    .min(0, 'temperature must be a number between 0 and 2')
    .max(2, 'temperature must be a number between 0 and 2'),
  samplePrompt: z.string(),
  sampleResponse: z.string(),
  completionPrompt: z.string(),
  overwriteDescription: z
    .enum(['true', 'false'], {
      error: 'overwrite-description must be true or false'
    })
    .transform((value) => value === 'true'),
  outputMode: outputModeSchema,
  commentMode: commentModeSchema,
  azureEndpoint: z.string(),
  azureOpenAIApiVersion: z.string()
})

export type Inputs = z.infer<typeof inputsSchema>

function getGithubToken(): string {
  return core.getInput('github-token', { required: true })
}

function getOpenAIApiKey(): string {
  return core.getInput('openai-api-key', { required: true })
}

function getOpenAIBaseURL(): string | undefined {
  return core.getInput('openai-base-url') || undefined
}

function getProvider(): string {
  return core.getInput('provider', { required: true })
}

function getPullRequestId(): number | undefined {
  const value = core.getInput('pull-request-id')
  if (!value) {
    return undefined
  }
  return Number(value)
}

function getAllowedUsers(): string[] {
  return core
    .getInput('allowed-users')
    .split(',')
    .map((user) => user.trim())
    .filter(Boolean)
}

function getOpenAIModel(): string {
  return core.getInput('openai-model', { required: true })
}

function getMaxTokens(): number {
  return Number(core.getInput('max-tokens') || '1000')
}

function getTemperature(): number {
  return Number(core.getInput('temperature') || '0.6')
}

function getSamplePrompt(): string {
  return core.getInput('sample-prompt')
}

function getSampleResponse(): string {
  return core.getInput('sample-response')
}

function getCompletionPrompt(): string {
  return core.getInput('completion-prompt')
}

function getOverwriteDescription(): string {
  return core.getInput('overwrite-description').toLowerCase() || 'false'
}

function getOutputMode(): string {
  return core.getInput('output-mode') || 'description'
}

function getCommentMode(): string {
  return core.getInput('comment-mode') || 'update'
}

function getAzureEndpoint(): string {
  return core.getInput('azure-endpoint')
}

function getAzureOpenAIApiVersion(): string {
  return core.getInput('azure-openai-api-version')
}

export function getInputs(): Inputs {
  const inputs = {
    githubToken: getGithubToken(),
    openAIApiKey: getOpenAIApiKey(),
    openAIBaseURL: getOpenAIBaseURL(),
    provider: getProvider(),
    pullRequestId: getPullRequestId(),
    allowedUsers: getAllowedUsers(),
    openAIModel: getOpenAIModel(),
    maxTokens: getMaxTokens(),
    temperature: getTemperature(),
    samplePrompt: getSamplePrompt(),
    sampleResponse: getSampleResponse(),
    completionPrompt: getCompletionPrompt(),
    overwriteDescription: getOverwriteDescription(),
    outputMode: getOutputMode(),
    commentMode: getCommentMode(),
    azureEndpoint: getAzureEndpoint(),
    azureOpenAIApiVersion: getAzureOpenAIApiVersion()
  }

  return inputsSchema.parse({
    ...inputs,
    aiProviderConfiguration: {
      provider: inputs.provider,
      apiKey: inputs.openAIApiKey,
      baseURL: inputs.openAIBaseURL,
      endpoint: inputs.azureEndpoint,
      apiVersion: inputs.azureOpenAIApiVersion
    }
  })
}
