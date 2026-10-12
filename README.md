# AI PR Description GitHub Action

Autofill the description of your pull requests with the power of AI!

## Spend less time writing PR descriptions

PR descriptions are easy to leave until last, then rush—or skip. This action
turns a pull request's title and changes into a useful first draft. Reviewers
get context on the purpose of the change before they dive into the diff.

It focuses on why the change matters, not just what files changed. It fills in
only an empty description by default, so authors keep control. You can also
choose to overwrite an existing description or publish the draft as a comment.

### Automate PR descriptions on your terms

Want more control than GitHub Copilot's built-in PR summaries? Run description
generation as your own GitHub Actions workflow. Choose the AI service, tailor
the writing to your team's conventions, and control how the result is
published:

- **Run it your way:** Trigger generation on pull request events and control
  who it runs for with your existing Actions workflow.
- **Choose the AI service:** Use OpenAI, Azure OpenAI, or another
  OpenAI-compatible Chat Completions API, including a custom base URL.
- **Match your review process:** Set team-specific prompts and examples, then
  fill an empty description, explicitly overwrite it, or publish a comment.

You manage the provider credentials and pay any usage charges directly to your
AI provider.

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
         - uses: tvcsantos/ai-pr-description@v1
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
| `openai-base-url`          | No       | Compatible API URL when using `openai` |
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
- uses: tvcsantos/ai-pr-description@v1
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
<summary>Permission denied when updating the PR description (403)</summary>

A `403` error usually means the token cannot write to the pull request. When
using `GITHUB_TOKEN`, grant permission in your workflow:

```yaml
permissions:
  contents: read
  pull-requests: write
```

If the error persists, check **Settings > Actions > General > Workflow
permissions** for repository or organization restrictions. Workflows triggered
by pull requests from forks typically receive a read-only `GITHUB_TOKEN`, so
this setting alone may not resolve the error.

</details>

<!-- markdownlint-enable MD033 -->

## Contributing

Contributions are welcome. Please read the [contribution guide](CONTRIBUTING.md)
and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](LICENSE).

## Project origins

This project started as a fork of Dimitris Platis's
[`platisd/openai-pr-description`][openai-pr-description] and has since been
substantially adapted. It is maintained independently and may differ from the
original project.

[repository-secret]:
  https://docs.github.com/en/actions/security-guides/encrypted-secrets
[openai-pr-description]: https://github.com/platisd/openai-pr-description
