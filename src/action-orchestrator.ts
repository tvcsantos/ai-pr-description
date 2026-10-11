import * as core from '@actions/core'
import * as github from '@actions/github'
import { createAIProvider } from './ai/provider-factory.js'
import {
  createGithubClient,
  type Octokit,
  type PullRequest,
  type PullRequestReference
} from './github.js'
import { getInputs, type Inputs } from './inputs.js'
import {
  COMPLETION_PROMPT,
  GOOD_SAMPLE_RESPONSE,
  MAX_COMPLETION_PROMPT_CHARACTERS,
  SAMPLE_PROMPT,
  SYSTEM_PROMPT
} from './ai/prompting.js'

const MAX_PULL_REQUEST_FILES = 300
const REDUNDANT_PREFIX = 'This pull request '
const COMMENT_MARKER = '<!-- ai-pr-description -->'

export class ActionOrchestrator {
  private inputs!: Inputs
  private octokit!: Octokit
  private reference!: PullRequestReference

  async run(): Promise<void> {
    try {
      this.inputs = getInputs()

      this.inputs.completionPrompt =
        this.inputs.completionPrompt || COMPLETION_PROMPT

      const pullRequestId = this.resolvePullRequestId()

      if (pullRequestId === undefined) {
        core.warning(
          'Could not find a pull request ID. Is this a pull request?'
        )
        return
      }

      this.octokit = createGithubClient(this.inputs.githubToken)

      this.reference = {
        ...github.context.repo,
        pull_number: pullRequestId
      }

      const pullRequest = await this.getPullRequest()

      if (this.shouldSkip(pullRequest)) {
        return
      }

      const patches = await this.collectPatches()

      const completionPrompt = this.buildCompletionPrompt(patches)

      const description = await this.generateDescription(
        pullRequest.title,
        completionPrompt
      )

      await this.publishDescription(description)
    } catch (error) {
      core.setFailed(error instanceof Error ? error.message : String(error))
    }
  }

  private resolvePullRequestId(): number | undefined {
    return (
      this.inputs.pullRequestId ??
      (github.context.issue.number ||
        github.context.payload.number ||
        undefined)
    )
  }

  private async getPullRequest(): Promise<PullRequest> {
    const response = await this.octokit.rest.pulls.get(this.reference)
    return response.data
  }

  private shouldSkip(pullRequest: PullRequest): boolean {
    const overwriteDescription = this.inputs.overwriteDescription

    if (
      this.inputs.outputMode === 'description' &&
      pullRequest.body &&
      !overwriteDescription
    ) {
      core.info('Pull request already has a description, skipping')
      return true
    }

    const allowedUsers = this.inputs.allowedUsers

    if (
      allowedUsers.length > 0 &&
      !allowedUsers.includes(pullRequest.user.login)
    ) {
      core.info(
        `Pull request author ${pullRequest.user.login} is not allowed to trigger this action`
      )
      return true
    }
    return false
  }

  private async collectPatches(): Promise<string[]> {
    const patches: string[] = []
    let processedFiles = 0
    let remainingCharacters =
      MAX_COMPLETION_PROMPT_CHARACTERS - this.inputs.completionPrompt.length

    if (remainingCharacters <= 0) {
      return patches
    }

    const pages = this.octokit.paginate.iterator(
      this.octokit.rest.pulls.listFiles,
      {
        ...this.reference,
        per_page: 100
      }
    )
    for await (const files of pages) {
      for (const file of files.data) {
        processedFiles += 1
        if (file.patch !== undefined) {
          const patch = `Changes in file ${file.filename}: ${file.patch}\n`
          if (patch.length > remainingCharacters) {
            return patches
          }
          patches.push(patch)
          remainingCharacters -= patch.length
          if (remainingCharacters === 0) {
            return patches
          }
        }
        if (processedFiles >= MAX_PULL_REQUEST_FILES) {
          return patches
        }
      }
    }
    return patches
  }

  private buildCompletionPrompt(patches: string[]): string {
    let completionPrompt = this.inputs.completionPrompt
    completionPrompt += patches.join('')
    if (completionPrompt.length > MAX_COMPLETION_PROMPT_CHARACTERS) {
      completionPrompt = completionPrompt.slice(
        0,
        MAX_COMPLETION_PROMPT_CHARACTERS
      )
    }
    return completionPrompt
  }

  private async generateDescription(
    title: string,
    completionPrompt: string
  ): Promise<string> {
    const model = this.inputs.openAIModel
    const maxTokens = this.inputs.maxTokens
    const temperature = this.inputs.temperature

    const aiProvider = createAIProvider(this.inputs.aiProviderConfiguration)
    const description = await aiProvider.generateChatCompletion({
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: this.inputs.samplePrompt || SAMPLE_PROMPT
        },
        {
          role: 'assistant',
          content: this.inputs.sampleResponse || GOOD_SAMPLE_RESPONSE
        },
        {
          role: 'user',
          content: `Title of the pull request: ${title}`
        },
        { role: 'user', content: completionPrompt }
      ],
      temperature,
      maxTokens
    })
    return this.normalizeDescription(description)
  }

  private normalizeDescription(description: string | undefined): string {
    if (description === undefined) {
      throw new Error('AI did not return a pull request description')
    }
    if (description.startsWith(REDUNDANT_PREFIX)) {
      description = description.slice(REDUNDANT_PREFIX.length)
      if (description.length > 0) {
        description = description[0].toUpperCase() + description.slice(1)
      }
    }
    if (description.trim() === '') {
      throw new Error('AI did not return a non-empty pull request description')
    }
    return description
  }

  private async publishDescription(description: string): Promise<void> {
    core.info(`Generated pull request description: '${description}'`)
    switch (this.inputs.outputMode) {
      case 'description': {
        const parameters = {
          owner: this.reference.owner,
          repo: this.reference.repo,
          issue_number: this.reference.pull_number,
          body: description
        }
        await this.octokit.rest.issues.update(parameters)
        break
      }
      case 'comment': {
        await this.publishComment(description)
        break
      }
    }
  }

  private async publishComment(description: string): Promise<void> {
    const reference = {
      owner: this.reference.owner,
      repo: this.reference.repo,
      issue_number: this.reference.pull_number
    }
    const body = `${COMMENT_MARKER}\n\n${description}`

    if (this.inputs.commentMode === 'create') {
      await this.octokit.rest.issues.createComment({ ...reference, body })
      return
    }

    const { viewer } = await this.octokit.graphql<{
      viewer: { login: string }
    }>('query { viewer { login } }')
    const pages = this.octokit.paginate.iterator(
      this.octokit.rest.issues.listComments,
      { ...reference, per_page: 100 }
    )
    for await (const page of pages) {
      const comment = page.data.find(
        (comment) =>
          comment.body?.startsWith(COMMENT_MARKER) &&
          comment.user?.login === viewer.login
      )
      if (comment) {
        await this.octokit.rest.issues.updateComment({
          owner: reference.owner,
          repo: reference.repo,
          comment_id: comment.id,
          body
        })
        return
      }
    }
    await this.octokit.rest.issues.createComment({ ...reference, body })
  }
}
