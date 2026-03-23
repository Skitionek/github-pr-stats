import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import * as core from '@actions/core'
import { parseQueryParams } from '../api/github-pr-stats.js'
import { GitHubAPIClient } from '../api/utils/github-api.js'
import { DataProcessor } from '../api/utils/inner_data_processor.js'
import { MarkdownGenerator } from '../api/utils/markdown_generator.js'
import type { APIParams, ProcessedPR, RepoAggregate, PRStats } from '../api/types.js'

const REGION_START = '<!-- region github-pr-stats -->'
const REGION_END = '<!-- endregion -->'

type ScriptOptions = {
  file: string
  params: APIParams
  commitChanges: boolean
  commitMessage: string
}
const INPUTS = ['mode', 'theme', 'status', 'min_stars', 'limit', 'sort', 'stats', 'fields'] as (keyof APIParams)[]
const USER = {
  name: 'github-pr-stats-action[bot]',
  email: 'github-pr-stats-action[bot]@users.noreply.github.com'
}

function readActionInputs(): ScriptOptions {
  const username = core.getInput('username', { required: false, trimWhitespace: true }) || process.env.GITHUB_REPOSITORY_OWNER
  if (!username) {
    throw new Error('Missing required input: username')
  }

  const file = core.getInput('file', { required: false, trimWhitespace: true }) || 'README.md'
  const commitChanges = core.getBooleanInput('commit_changes', { required: false, trimWhitespace: true })
  const commitMessage = core.getInput('commit_message', { required: false, trimWhitespace: true }) || 'docs: update GitHub PR stats markdown'

  const params = parseQueryParams({
    username,
    ...Object.fromEntries(
      INPUTS.map((key) => [key, core.getInput(key, { required: false, trimWhitespace: true })])
    )
  })

  return { file, params, commitChanges, commitMessage }
}

function runGit(args: string[]): void {
  execFileSync('git', args, { stdio: 'inherit' })
}

function commitAndPushChanges(targetFile: string, message: string): void {
  runGit(['config', 'user.name', USER.name])
  runGit(['config', 'user.email', USER.email])
  runGit(['add', targetFile])

  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' })
    core.info('No staged changes to commit.')
    return
  } catch {
    // Expected when there are staged changes.
  }

  runGit(['commit', '-m', message])
  runGit(['push'])
}

function buildRegionMarkdown(options: ScriptOptions, data: { prs: ProcessedPR[]; repos?: RepoAggregate[]; stats: PRStats }): string {
  return MarkdownGenerator.generate(options.params.username, data.prs, data.stats, options.params, data.repos)
}

function replaceRegion(content: string, markdown: string): string {
  const pattern = new RegExp(`${REGION_START}[\\s\\S]*?${REGION_END}`)
  if (!pattern.test(content)) {
    throw new Error(
      `Could not find region markers. Add:\n${REGION_START}\n${REGION_END}`
    )
  }

  return content.replace(pattern, `${REGION_START}\n${markdown}\n${REGION_END}`)
}

export async function main(): Promise<void> {
  const options = readActionInputs()
  const rawToken =
    core.getInput('github_token', { required: false, trimWhitespace: true }) ||
    process.env.GITHUB_TOKEN

  if (!rawToken) {
    throw new Error('GitHub token is required for API access. Provide it via the "github_token" action input or GITHUB_TOKEN environment variable.')
  }

  const token = rawToken.trim()
  const client = new GitHubAPIClient(token)
  const rawPRs = await client.getAllUserPRs(options.params.username)

  const processed = DataProcessor.processData(rawPRs, options.params)
  const markdown = buildRegionMarkdown(options, processed)
  const targetPath = resolve(options.file)
  const currentContent = readFileSync(targetPath, 'utf8')
  const nextContent = replaceRegion(currentContent, markdown)

  if (nextContent !== currentContent) {
    writeFileSync(targetPath, nextContent, 'utf8')
    core.setOutput('changed', 'true')
    core.info(`Updated markdown region in ${options.file}`)

    if (options.commitChanges) {
      commitAndPushChanges(options.file, options.commitMessage)
      core.info(`Committed and pushed markdown update for ${options.file}`)
    }

    return
  }

  core.setOutput('changed', 'false')
  core.info(`No markdown changes needed for ${options.file}`)
}

main().catch(error => {
  if (error instanceof Error) {
    core.setFailed(error.message)
    core.error(error.message)
    process.exit(1)
  }

  const message = `Unexpected error: ${String(error)}`
  core.setFailed(message)
  core.error(message)
  process.exit(1)
})
