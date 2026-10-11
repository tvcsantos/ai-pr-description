import { getOctokit } from '@actions/github'

export type Octokit = ReturnType<typeof getOctokit>
export type PullRequest = Awaited<
  ReturnType<Octokit['rest']['pulls']['get']>
>['data']
export type PullRequestReference = {
  owner: string
  repo: string
  pull_number: number
}

export function createGithubClient(token: string): Octokit {
  const apiUrl = process.env.GITHUB_API_URL
  return getOctokit(token, apiUrl ? { baseUrl: apiUrl } : {})
}
