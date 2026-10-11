import { afterEach, describe, expect, it, jest } from '@jest/globals'

const client = {}
const getOctokit = jest.fn(
  (token: string, options?: { baseUrl?: string }) => client
)
jest.unstable_mockModule('@actions/github', () => ({ getOctokit }))
const { createGithubClient } = await import('../src/github.js')
const originalApiUrl = process.env.GITHUB_API_URL

describe('GitHub client', () => {
  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL
    else process.env.GITHUB_API_URL = originalApiUrl
  })

  it('uses the default API URL', () => {
    delete process.env.GITHUB_API_URL
    expect(createGithubClient('token')).toBe(client)
    expect(getOctokit).toHaveBeenCalledWith('token', {})
  })

  it('honors a custom API URL', () => {
    process.env.GITHUB_API_URL = 'https://github.example.com/api/v3'
    expect(createGithubClient('token')).toBe(client)
    expect(getOctokit).toHaveBeenCalledWith('token', {
      baseUrl: 'https://github.example.com/api/v3'
    })
  })
})
