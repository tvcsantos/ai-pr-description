import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { z } from 'zod/v4'
import type { InputOptions } from '@actions/core'
import type { ChatCompletionRequest } from '../src/ai/provider.js'
import type { PullRequestReference } from '../src/github.js'
import {
  COMPLETION_PROMPT,
  GOOD_SAMPLE_RESPONSE,
  MAX_COMPLETION_PROMPT_CHARACTERS,
  SAMPLE_PROMPT,
  SYSTEM_PROMPT
} from '../src/ai/prompting.js'

let values: Record<string, string>
const getInput = jest.fn((name: string, options?: InputOptions): string => {
  const value = values[name] ?? ''
  if (options?.required && !value) throw new Error(`Missing ${name}`)
  return value
})
const setFailed = jest.fn()
const warning = jest.fn()
const info = jest.fn()
jest.unstable_mockModule('@actions/core', () => ({
  getInput,
  setFailed,
  warning,
  info
}))

const context = {
  repo: { owner: 'owner', repo: 'repo' },
  issue: { number: 7 as number | undefined },
  payload: { number: undefined as number | undefined }
}
jest.unstable_mockModule('@actions/github', () => ({ context }))

type File = { filename: string; patch?: string }
const get = jest.fn<
  (reference: PullRequestReference) => Promise<{
    data: { title: string; body: string | null; user: { login: string } }
  }>
>()
const update =
  jest.fn<
    (reference: {
      owner: string
      repo: string
      issue_number: number
      body: string
    }) => Promise<void>
  >()
const listFiles = jest.fn()
const createComment = jest.fn<typeof update>()
const listComments = jest.fn()
const updateComment =
  jest.fn<
    (parameters: {
      owner: string
      repo: string
      comment_id: number
      body: string
    }) => Promise<void>
  >()
const publisher = { login: 'github-actions[bot]' }
const graphql =
  jest.fn<(query: string) => Promise<{ viewer: { login: string } }>>()
let commentPages: {
  id: number
  body?: string | null
  user?: { login: string } | null
}[][]
let fetchedCommentPages: number
const commentIterator = jest.fn(async function* () {
  for (const data of commentPages) {
    fetchedCommentPages += 1
    yield { data }
  }
})
let pages: File[][]
let fetchedPages: number
const iterator = jest.fn(async function* (
  method: typeof listFiles,
  reference: (
    PullRequestReference | { owner: string; repo: string; issue_number: number }
  ) & { per_page: number }
) {
  if (method === listComments) {
    yield* commentIterator()
    return
  }
  for (const data of pages) {
    fetchedPages += 1
    yield { data }
  }
})
const createGithubClient = jest.fn((token: string) => ({
  graphql,
  rest: {
    pulls: { get, listFiles },
    issues: { update, createComment, listComments, updateComment }
  },
  paginate: { iterator }
}))
jest.unstable_mockModule('../src/github.js', () => ({ createGithubClient }))
const generateChatCompletion =
  jest.fn<(request: ChatCompletionRequest) => Promise<string | undefined>>()
const createAIProvider = jest.fn((configuration: unknown) => ({
  generateChatCompletion
}))
jest.unstable_mockModule('../src/ai/provider-factory.js', () => {
  return {
    createAIProvider,
    aiProviderConfigurationSchema: z.object({
      provider: z.enum(['openai', 'azure-openai']),
      apiKey: z.string().min(1)
    })
  }
})
const { run } = await import('../src/main.js')

const reference = { owner: 'owner', repo: 'repo', pull_number: 7 }
const file: File = { filename: 'test.ts', patch: '+ test' }
const patch = `Changes in file ${file.filename}: ${file.patch}\n`

function completionContent(): string {
  const request = generateChatCompletion.mock.calls[0]?.[0]
  if (!request) throw new Error('No AI request was made')
  return request.messages[request.messages.length - 1].content
}

describe('action orchestration', () => {
  beforeEach(() => {
    values = {
      'github-token': 'github-key',
      'openai-api-key': 'ai-key',
      'openai-model': 'chosen-model',
      provider: 'openai'
    }
    context.issue.number = 7
    context.payload.number = undefined
    pages = [[file]]
    fetchedPages = 0
    get.mockReset().mockResolvedValue({
      data: { title: 'Improve tests', body: null, user: { login: 'author' } }
    })
    update.mockReset().mockResolvedValue(undefined)
    createComment.mockReset().mockResolvedValue(undefined)
    updateComment.mockReset().mockResolvedValue(undefined)
    graphql.mockReset().mockResolvedValue({ viewer: publisher })
    commentPages = []
    fetchedCommentPages = 0
    generateChatCompletion
      .mockReset()
      .mockResolvedValue('This pull request improves tests.')
    iterator.mockClear()
  })

  it('generates, normalizes, and updates a description with default prompts', async () => {
    await run()
    expect(createGithubClient).toHaveBeenCalledWith('github-key')
    expect(get).toHaveBeenCalledWith(reference)
    expect(iterator).toHaveBeenCalledWith(listFiles, {
      ...reference,
      per_page: 100
    })
    expect(createAIProvider).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'ai-key'
    })
    expect(generateChatCompletion).toHaveBeenCalledWith({
      model: 'chosen-model',
      maxTokens: 1000,
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: SAMPLE_PROMPT },
        { role: 'assistant', content: GOOD_SAMPLE_RESPONSE },
        { role: 'user', content: 'Title of the pull request: Improve tests' },
        { role: 'user', content: COMPLETION_PROMPT + patch }
      ]
    })
    expect(update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 7,
      body: 'Improves tests.'
    })
    expect(setFailed).not.toHaveBeenCalled()
    expect(createComment).not.toHaveBeenCalled()
  })

  it('uses custom prompts and preserves descriptions without the prefix', async () => {
    Object.assign(values, {
      'sample-prompt': 'sample',
      'sample-response': 'response',
      'completion-prompt': 'completion',
      'openai-model': 'custom-model'
    })
    generateChatCompletion.mockResolvedValue('Already normalized.')
    await run()
    expect(generateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-model',
        messages: expect.arrayContaining([
          { role: 'user', content: 'sample' },
          { role: 'assistant', content: 'response' },
          { role: 'user', content: 'completion' + patch }
        ])
      })
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Already normalized.' })
    )
  })

  it('prefers an explicit PR number', async () => {
    values['pull-request-id'] = '42'
    await run()
    expect(get).toHaveBeenCalledWith({ ...reference, pull_number: 42 })
  })

  it('falls back to the event payload number', async () => {
    context.issue.number = undefined
    context.payload.number = 9
    await run()
    expect(get).toHaveBeenCalledWith({ ...reference, pull_number: 9 })
  })

  it('warns and skips when no PR number exists', async () => {
    context.issue.number = undefined
    await run()
    expect(warning).toHaveBeenCalledTimes(1)
    expect(createGithubClient).not.toHaveBeenCalled()
    expect(generateChatCompletion).not.toHaveBeenCalled()
  })

  it.each([
    { 'github-token': '' },
    { 'openai-model': '' },
    { 'pull-request-id': 'bad' },
    { 'max-tokens': '0' },
    { temperature: '3' },
    { provider: 'unknown' },
    { provider: '' },
    { 'overwrite-description': 'yes' },
    { 'output-mode': 'unknown' },
    { 'comment-mode': 'unknown' }
  ])('fails invalid inputs before creating clients: %j', async (invalid) => {
    Object.assign(values, invalid)
    await run()
    expect(setFailed).toHaveBeenCalledTimes(1)
    expect(createGithubClient).not.toHaveBeenCalled()
    expect(createAIProvider).not.toHaveBeenCalled()
  })

  it('skips an existing description', async () => {
    get.mockResolvedValue({
      data: { title: 'Tests', body: 'Existing', user: { login: 'author' } }
    })
    await run()
    expect(iterator).not.toHaveBeenCalled()
    expect(generateChatCompletion).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('overwrites when enabled', async () => {
    values['overwrite-description'] = 'true'
    get.mockResolvedValue({
      data: { title: 'Tests', body: 'Existing', user: { login: 'author' } }
    })
    await run()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it.each(['false', 'true'])(
    'posts a comment without changing the existing description (overwrite=%s)',
    async (overwrite) => {
      values['output-mode'] = 'comment'
      values['overwrite-description'] = overwrite
      const pullRequest = {
        title: 'Tests',
        body: 'Original author description',
        user: { login: 'author' }
      }
      get.mockResolvedValue({ data: pullRequest })
      await run()
      expect(createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 7,
        body: '<!-- ai-pr-description -->\n\nImproves tests.'
      })
      expect(update).not.toHaveBeenCalled()
      expect(pullRequest.body).toBe('Original author description')
      expect(setFailed).not.toHaveBeenCalled()
    }
  )

  it('posts a comment for a PR with an empty description', async () => {
    values['output-mode'] = 'comment'
    await run()
    expect(createComment).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it('updates the existing action comment on a later page without adding another', async () => {
    values['output-mode'] = 'comment'
    commentPages = [
      [{ id: 1, body: 'User comment' }, { id: 2, body: null }, { id: 3 }],
      [
        {
          id: 42,
          body: '<!-- ai-pr-description -->\n\nPrevious description',
          user: publisher
        }
      ],
      [{ id: 99, body: 'Unrelated comment' }]
    ]
    await run()
    expect(iterator).toHaveBeenCalledWith(listComments, {
      owner: 'owner',
      repo: 'repo',
      issue_number: 7,
      per_page: 100
    })
    expect(updateComment).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      comment_id: 42,
      body: '<!-- ai-pr-description -->\n\nImproves tests.'
    })
    expect(fetchedCommentPages).toBe(2)
    expect(createComment).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('creates a marked comment without modifying unrelated comments', async () => {
    values['output-mode'] = 'comment'
    commentPages = [[{ id: 1, body: 'User comment' }]]
    await run()
    expect(createComment).toHaveBeenCalledTimes(1)
    expect(updateComment).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('updates rather than creates on a rerun', async () => {
    values['output-mode'] = 'comment'
    await run()
    const body = createComment.mock.calls[0][0].body
    commentPages = [[{ id: 42, body, user: publisher }]]
    generateChatCompletion.mockResolvedValue('Updated generated description')
    await run()
    expect(createComment).toHaveBeenCalledTimes(1)
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 42,
        body: '<!-- ai-pr-description -->\n\nUpdated generated description'
      })
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('surfaces comment update errors without creating a duplicate', async () => {
    values['output-mode'] = 'comment'
    commentPages = [
      [{ id: 42, body: '<!-- ai-pr-description -->\n\nOld', user: publisher }]
    ]
    updateComment.mockRejectedValue(new Error('Comment update denied'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('Comment update denied')
    expect(createComment).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('surfaces comment lookup errors without creating a duplicate', async () => {
    values['output-mode'] = 'comment'
    commentIterator.mockImplementationOnce(async function* () {
      throw new Error('Comments unavailable')
      yield { data: [] }
    })
    await run()
    expect(setFailed).toHaveBeenCalledWith('Comments unavailable')
    expect(createComment).not.toHaveBeenCalled()
    expect(updateComment).not.toHaveBeenCalled()
  })

  it('does not overwrite another author’s marked comment', async () => {
    values['output-mode'] = 'comment'
    commentPages = [
      [
        {
          id: 1,
          body: '<!-- ai-pr-description -->\n\nHuman text',
          user: { login: 'human' }
        },
        {
          id: 2,
          body: '<!-- ai-pr-description -->\n\nUnknown owner',
          user: null
        },
        { id: 3, body: '<!-- ai-pr-description -->\n\nNo owner' }
      ]
    ]
    await run()
    expect(createComment).toHaveBeenCalledTimes(1)
    expect(updateComment).not.toHaveBeenCalled()
  })

  it('matches a personal token identity as well as the marker', async () => {
    values['output-mode'] = 'comment'
    graphql.mockResolvedValue({ viewer: { login: 'maintainer' } })
    commentPages = [
      [
        {
          id: 1,
          body: '<!-- ai-pr-description -->\n\nOther bot',
          user: publisher
        },
        {
          id: 2,
          body: '<!-- ai-pr-description -->\n\nOwn text',
          user: { login: 'maintainer' }
        }
      ]
    ]
    await run()
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 2 })
    )
    expect(createComment).not.toHaveBeenCalled()
  })

  it('fails identity lookup without modifying any comments', async () => {
    values['output-mode'] = 'comment'
    graphql.mockRejectedValue(new Error('Identity unavailable'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('Identity unavailable')
    expect(commentIterator).not.toHaveBeenCalled()
    expect(createComment).not.toHaveBeenCalled()
    expect(updateComment).not.toHaveBeenCalled()
  })
  it('still enforces the allowlist in comment mode', async () => {
    values['output-mode'] = 'comment'
    values['allowed-users'] = 'someone-else'
    await run()
    expect(generateChatCompletion).not.toHaveBeenCalled()
    expect(createComment).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'This pull request '])(
    'does not post invalid generated content in comment mode: %j',
    async (content) => {
      values['output-mode'] = 'comment'
      generateChatCompletion.mockResolvedValue(content)
      await run()
      expect(setFailed).toHaveBeenCalledTimes(1)
      expect(createComment).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    }
  )

  it('surfaces comment errors without falling back to a description update', async () => {
    values['output-mode'] = 'comment'
    createComment.mockRejectedValue(new Error('Comment denied'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('Comment denied')
    expect(update).not.toHaveBeenCalled()
  })

  it('creates a new comment on each run when comment-mode is create', async () => {
    values['output-mode'] = 'comment'
    values['comment-mode'] = 'create'
    commentPages = [[{ id: 42, body: '<!-- ai-pr-description -->\n\nOld' }]]
    await run()
    await run()
    expect(createComment).toHaveBeenCalledTimes(2)
    expect(commentIterator).not.toHaveBeenCalled()
    expect(updateComment).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(graphql).not.toHaveBeenCalled()
  })

  it('ignores comment-mode when publishing a description', async () => {
    values['comment-mode'] = 'create'
    await run()
    expect(update).toHaveBeenCalledTimes(1)
    expect(createComment).not.toHaveBeenCalled()
    expect(updateComment).not.toHaveBeenCalled()
    expect(commentIterator).not.toHaveBeenCalled()
  })

  it('skips authors outside the allowlist', async () => {
    values['allowed-users'] = 'someone-else'
    await run()
    expect(iterator).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts an allowlisted author', async () => {
    values['allowed-users'] = 'someone-else, author'
    await run()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('iterates multiple pages and ignores patchless files', async () => {
    pages = [[{ filename: 'binary' }, file], [file], []]
    await run()
    expect(completionContent()).toBe(COMPLETION_PROMPT + patch + patch)
    expect(fetchedPages).toBe(3)
  })

  it('stops at 300 examined files, including patchless files', async () => {
    const binary = { filename: 'binary' }
    pages = [
      Array.from({ length: 100 }, () => binary),
      Array.from({ length: 100 }, () => binary),
      [...Array.from({ length: 99 }, () => binary), file],
      [file]
    ]
    await run()
    expect(completionContent()).toBe(COMPLETION_PROMPT + patch)
    expect(fetchedPages).toBe(3)
  })

  it('includes exact-fit patches and stops before fetching the next page', async () => {
    values['completion-prompt'] = 'x'.repeat(
      MAX_COMPLETION_PROMPT_CHARACTERS - patch.length
    )
    pages = [[file], [file]]
    await run()
    expect(completionContent()).toBe(values['completion-prompt'] + patch)
    expect(fetchedPages).toBe(1)
  })

  it('stops before the first oversized patch without adding or truncating it', async () => {
    values['completion-prompt'] = 'x'.repeat(
      MAX_COMPLETION_PROMPT_CHARACTERS - patch.length - 1
    )
    pages = [[file, { filename: 'large', patch: 'too large' }, file], [file]]
    await run()
    expect(completionContent()).toBe(values['completion-prompt'] + patch)
    expect(fetchedPages).toBe(1)
  })

  it('does not add an oversized first patch', async () => {
    values['completion-prompt'] = 'x'.repeat(
      MAX_COMPLETION_PROMPT_CHARACTERS - patch.length + 1
    )
    await run()
    expect(completionContent()).toBe(values['completion-prompt'])
  })

  it.each([0, 1])(
    'skips file requests with an exhausted budget (%s over limit)',
    async (extra) => {
      values['completion-prompt'] = 'x'.repeat(
        MAX_COMPLETION_PROMPT_CHARACTERS + extra
      )
      await run()
      expect(iterator).not.toHaveBeenCalled()
      expect(completionContent()).toHaveLength(MAX_COMPLETION_PROMPT_CHARACTERS)
    }
  )

  it.each([
    undefined,
    '',
    ' \n\t ',
    'This pull request ',
    'This pull request \n'
  ])(
    'rejects missing or blank normalized descriptions: %j',
    async (description) => {
      generateChatCompletion.mockResolvedValue(description)
      await run()
      expect(setFailed).toHaveBeenCalledWith(
        expect.stringContaining('AI did not return')
      )
      expect(update).not.toHaveBeenCalled()
    }
  )

  it('surfaces PR fetch errors without generating a description', async () => {
    get.mockRejectedValue(new Error('GitHub unavailable'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('GitHub unavailable')
    expect(generateChatCompletion).not.toHaveBeenCalled()
  })

  it('surfaces pagination errors without updating', async () => {
    iterator.mockImplementationOnce(async function* () {
      throw new Error('Files unavailable')
      yield { data: [] }
    })
    await run()
    expect(setFailed).toHaveBeenCalledWith('Files unavailable')
    expect(update).not.toHaveBeenCalled()
  })

  it('surfaces AI errors without updating', async () => {
    generateChatCompletion.mockRejectedValue(new Error('AI unavailable'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('AI unavailable')
    expect(update).not.toHaveBeenCalled()
  })

  it('surfaces update errors', async () => {
    update.mockRejectedValue(new Error('Update denied'))
    await run()
    expect(setFailed).toHaveBeenCalledWith('Update denied')
  })

  it('surfaces non-Error failures', async () => {
    get.mockRejectedValue('Unknown failure')
    await run()
    expect(setFailed).toHaveBeenCalledWith('Unknown failure')
  })
})
