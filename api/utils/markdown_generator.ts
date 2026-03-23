import type { ProcessedPR, RepoAggregate, PRStats, APIParams } from '../types.js'

type PRFieldKey = 'repo' | 'stars' | 'pr_title' | 'pr_number' | 'status' | 'created_date' | 'merged_date'
type RepoFieldKey = 'repo' | 'stars' | 'pr_numbers' | 'total' | 'merged' | 'open' | 'draft' | 'closed' | 'merged_rate'
type StatsFieldKey = 'total_pr' | 'merged_pr' | 'display_pr' | 'repos_with_pr' | 'repos_with_merged_pr' | 'showing_repos'

type FieldsConfig<T extends string | number | symbol, D> = {
  [K in T]: {
    label: string
    align: 'left' | 'right',
    format: (data: D) => string
  }
}

export class MarkdownGenerator {
  private static readonly FIELD_CONFIGS: FieldsConfig<PRFieldKey&RepoFieldKey, any> = {
    repo: { label: 'Repository', align: 'left', format: pr => `[${pr.repo}](https://github.com/${pr.repo})` },
    stars: { label: 'Stars', align: 'right', format: pr => `${pr.stars.toString()} ⭐` },
  }
  private static readonly PRFIELD_CONFIGS: FieldsConfig<PRFieldKey, ProcessedPR> = {
    ...MarkdownGenerator.FIELD_CONFIGS,
    pr_title: { label: 'PR Title', align: 'left', format: pr => `[${MarkdownGenerator.escapeMarkdownCell(pr.pr_title)}](${pr.url})` },
    pr_number: { label: 'PR #', align: 'right', format: pr => `[#${pr.pr_number}](${pr.url})` },
    status: { label: 'Status', align: 'left', format: pr => pr.status },
    created_date: { label: 'Created', align: 'right', format: pr => pr.created_date },
    merged_date: { label: 'Merged', align: 'right', format: pr => pr.merged_date ?? '-' },
    
  }
  private static readonly REPOFIELD_CONFIGS: FieldsConfig<RepoFieldKey, RepoAggregate> = {
    ...MarkdownGenerator.FIELD_CONFIGS,
    pr_numbers: { label: 'PR Numbers', align: 'left', format: repo => MarkdownGenerator.escapeMarkdownCell(repo.pr_numbers.map(
      num => `[#${num}](https://github.com/${repo.repo}/pull/${num})`
    ).join(', ')) },
    total: { label: 'Total', align: 'right', format: repo => repo.total.toString() },
    merged: { label: 'Merged', align: 'right', format: repo => repo.merged.toString() },
    open: { label: 'Open', align: 'right', format: repo => repo.open.toString() },
    draft: { label: 'Draft', align: 'right', format: repo => repo.draft.toString() },
    closed: { label: 'Closed', align: 'right', format: repo => repo.closed.toString() },
    merged_rate: { label: 'Merged Rate', align: 'right', format: repo => `${repo.merged_rate}%` }
  }
    
  private static readonly STATS_FIELD_CONFIGS: FieldsConfig<StatsFieldKey, PRStats> = {
    total_pr: { label: 'Total PRs', align: 'right', format: stats => stats.total_pr.toString() },
    merged_pr: { label: 'Merged PRs', align: 'right', format: stats => stats.merged_pr.toString() },
    display_pr: { label: 'Display PRs', align: 'right', format: stats => stats.display_pr.toString() },
    repos_with_pr: { label: 'Repos(≥1 PR)', align: 'right', format: stats => stats.repos_with_pr.toString() },
    repos_with_merged_pr: { label: 'Repos(≥1 Merged PR)', align: 'right', format: stats => stats.repos_with_merged_pr.toString() },
    showing_repos: { label: 'Showing Repos', align: 'right', format: stats => stats.showing_repos.toString() }
  }

  static generate(
    _username: string,
    prs: ProcessedPR[],
    _stats: PRStats,
    params: APIParams,
    repos?: RepoAggregate[]
  ): string {
    let summaryFields: Partial<FieldsConfig<StatsFieldKey, PRStats>>;
    if (params.stats == 'all' || !params.stats) {
      summaryFields = this.STATS_FIELD_CONFIGS
    } else {
      const selectedKeys = params.stats
        .split(',')
        .map(s => s.trim())
        .filter((s): s is StatsFieldKey => s in this.STATS_FIELD_CONFIGS)
      summaryFields = selectedKeys.reduce((acc, key) => {
        acc[key] = this.STATS_FIELD_CONFIGS[key]
        return acc
      }, {} as Partial<FieldsConfig<StatsFieldKey, PRStats>>)
    }
    const summary = Object.entries(summaryFields)
      .map(([, config]) => {
        if (!config) return null
        return `**${config.label}:** ${config.format(_stats as PRStats)}`
      })
      .filter((segment): segment is string => segment !== null)
      .join(' | ')
    
    let markdownTable = ''
    if (params.mode === 'repo-aggregate') {
      const repoRows = repos || []
      const fields = params.fields || 'repo,stars,pr_numbers,total,merged,open,draft,closed,merged_rate'
      markdownTable = this.generateRepoTable(repoRows, fields)
    } else {
      const fields = params.fields || 'repo,stars,pr_title,pr_number,status,created_date,merged_date'
      markdownTable = this.generatePRTable(prs, fields)
    }
    return [
      summary,
      '',
      markdownTable
    ].join('\n')
  }

  private static generatePRTable(prs: ProcessedPR[], fieldsParam: string): string {
    const fields = this.parseFields(fieldsParam, this.PRFIELD_CONFIGS)

    const header = [
      `| ${fields.map((field) => this.PRFIELD_CONFIGS[field].label).join(' | ')} |`,
      `| ${fields.map((field) => this.getAlignmentMarker(this.PRFIELD_CONFIGS[field].align)).join(' | ')} |`
    ]

    const rows = prs.map((pr) => `| ${fields.map((field) => this.PRFIELD_CONFIGS[field].format(pr)).join(' | ')} |`)

    return [...header, ...rows].join('\n')
  }

  private static generateRepoTable(repos: RepoAggregate[], fieldsParam: string): string {
    const fields = this.parseFields(fieldsParam, this.REPOFIELD_CONFIGS)

    const header = [
      `| ${fields.map((field) => this.REPOFIELD_CONFIGS[field].label).join(' | ')} |`,
      `| ${fields.map((field) => this.getAlignmentMarker(this.REPOFIELD_CONFIGS[field].align)).join(' | ')} |`
    ]

    const rows = repos.map((repo) => `| ${fields.map((field) => this.REPOFIELD_CONFIGS[field].format(repo)).join(' | ')} |`)

    return [...header, ...rows].join('\n')
  }

  private static parseFields<T extends PRFieldKey | RepoFieldKey>(
    fieldsParam: string,
    availableFields: Readonly<Record<T, any>>
  ): T[] {
    const fieldKeys = fieldsParam.split(',').map((field) => field.trim())
    const fields: T[] = []

    if (!fieldKeys.includes('repo')) {
      fields.push('repo' as T)
    }

    for (const key of fieldKeys) {
      if (availableFields.hasOwnProperty(key as T)) {
        fields.push(key as T)
      }
    }

    if (fields.length === 0) {
      fields.push('repo' as T)
    }

    return fields
  }

  private static getAlignmentMarker(align: 'left' | 'right'): string {
    return align === 'right' ? '---:' : '---'
  }

  private static escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }
}
