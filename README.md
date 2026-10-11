# AI PR Description GitHub Action

Autofill the description of your pull requests with the power of AI!

## Spend less time writing PR descriptions

PR descriptions are easy to leave until last, then rush—or skip. This action
turns a pull request's title and changes into a useful first draft. Reviewers
get context on the purpose of the change before they dive into the diff.

It focuses on why the change matters, not just what files changed. It fills in
only an empty description by default, so authors keep control. You can also
choose to overwrite an existing description or publish the draft as a comment.

## Usage

### Generate a PR description

1. Add your API key as a [repository secret][repository-secret].
2. Add the action to a pull request workflow:

   ```yaml
   name: Autofill PR description

   on: pull_request

   concurrency:
     group:
       ai-pr-description-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: false

   jobs:
     ai-pr-description:
       runs-on: ubuntu-latest

       steps:
         - uses: tvcsantos/ai-pr-description@main
           with:
             github-token: ${{ secrets.GITHUB_TOKEN }}
             provider: openai
             openai-api-key: ${{ secrets.OPENAI_API_KEY }}
             openai-model: ${{ vars.OPENAI_MODEL }}
   ```

### Configure the provider

| Input                      | Required | Notes                               |
| -------------------------- | -------- | ----------------------------------- |
| `github-token`             | Yes      | GitHub token                        |
| `provider`                 | Yes      | `openai` or `azure-openai`          |
| `openai-api-key`           | Yes      | Used with either provider           |
| `openai-model`             | Yes      | Model name or Azure deployment name |
| `azure-endpoint`           | Azure    | Required when using `azure-openai`  |
| `azure-openai-api-version` | Azure    | Required when using `azure-openai`  |

### Customize generation

| Input                   | Description                        | Default                      |
| ----------------------- | ---------------------------------- | ---------------------------- |
| `pull-request-id`       | Pull request ID                    | Detected from event metadata |
| `max-tokens`            | Maximum generated tokens           | `1000`                       |
| `temperature`           | Creativity level (`0` to `2`)      | `0.6`                        |
| `sample-prompt`         | Context prompt                     | `SAMPLE_PROMPT`              |
| `sample-response`       | Example response                   | `GOOD_SAMPLE_RESPONSE`       |
| `completion-prompt`     | Description-generation prompt      | `COMPLETION_PROMPT`          |
| `overwrite-description` | Replace an existing PR description | `false`                      |

### Publish as a comment

Set `output-mode` to `comment` to leave the PR description unchanged:

```yaml
- uses: tvcsantos/ai-pr-description@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    openai-model: ${{ vars.OPENAI_MODEL }}
    output-mode: comment
```

**Update existing comment:**

Set `comment-mode` to `update` to edit the action's existing comment. This
requires `pull-requests: write`, the same token identity across runs, and a
shared `concurrency` group across workflows publishing to the same PR.

**Create a new comment:**

Set `comment-mode` to `create` to post a new comment each run.

## Development

Install dependencies:

```sh
npm ci
```

Run tests and type-check:

```sh
npm test
npm run typecheck
```

Build the action bundle:

```sh
npm run bundle
```

## Troubleshooting

<!-- markdownlint-disable MD033 -->

<details>
<summary><code>403</code> error when updating the PR description</summary>

If you get a `403` error when trying to update the PR description, it's most
likely because the GitHub Action is not allowed to do so. The easiest way
forward is to grant the necessary permissions to the `GITHUB_TOKEN` secret at
`<your_repo_url>/settings/actions` under `Workflow permissions`.

</details>

<!-- markdownlint-enable MD033 -->

[repository-secret]:
  https://docs.github.com/en/actions/security-guides/encrypted-secrets
