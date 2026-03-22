import type { ProcessedPR, RepoAggregate, PRStats, APIParams } from '../types.js'

type PRFieldKey = 'repo' | 'stars' | 'pr_title' | 'pr_number' | 'status' | 'created_date' | 'merged_date'
type RepoFieldKey = 'repo' | 'stars' | 'pr_numbers' | 'total' | 'merged' | 'open' | 'draft' | 'closed' | 'merged_rate'

type FieldConfig = {
  key: PRFieldKey | RepoFieldKey
  label: string
  align: 'left' | 'right'
}

export class MarkdownGenerator {
  private static readonly FIELD_CONFIGS: Record<string, FieldConfig> = {
    repo: { key: 'repo', label: 'Repository', align: 'left' },
    stars: { key: 'stars', label: 'Stars', align: 'right' },
    pr_title: { key: 'pr_title', label: 'PR Title', align: 'left' },
    pr_number: { key: 'pr_number', label: 'PR #', align: 'right' },
    status: { key: 'status', label: 'Status', align: 'left' },
    created_date: { key: 'created_date', label: 'Created', align: 'right' },
    merged_date: { key: 'merged_date', label: 'Merged', align: 'right' },
    pr_numbers: { key: 'pr_numbers', label: 'PR Numbers', align: 'left' },
    total: { key: 'total', label: 'Total', align: 'right' },
    merged: { key: 'merged', label: 'Merged', align: 'right' },
    open: { key: 'open', label: 'Open', align: 'right' },
    draft: { key: 'draft', label: 'Draft', align: 'right' },
    closed: { key: 'closed', label: 'Closed', align: 'right' },
    merged_rate: { key: 'merged_rate', label: 'Merged Rate', align: 'right' }
  }

  private static readonly PR_FIELDS = new Set<PRFieldKey>([
    'repo',
    'stars',
    'pr_title',
    'pr_number',
    'status',
    'created_date',
    'merged_date'
  ])

  private static readonly REPO_FIELDS = new Set<RepoFieldKey>([
    'repo',
    'stars',
    'pr_numbers',
    'total',
    'merged',
    'open',
    'draft',
    'closed',
    'merged_rate'
  ])

  static generate(
    _username: string,
    prs: ProcessedPR[],
    _stats: PRStats,
    params: APIParams,
    repos?: RepoAggregate[]
  ): string {
    if (params.mode === 'repo-aggregate') {
      const repoRows = repos || []
      const fields = params.fields || 'repo,stars,pr_numbers,total,merged,open,draft,closed,merged_rate'
      return this.generateRepoTable(repoRows, fields)
    }

    const fields = params.fields || 'repo,stars,pr_title,pr_number,status,created_date,merged_date'
    return this.generatePRTable(prs, fields)
  }

  private static generatePRTable(prs: ProcessedPR[], fieldsParam: string): string {
    const fields = this.parseFields(fieldsParam, this.PR_FIELDS)

    const header = [
      `| ${fields.map((field) => this.FIELD_CONFIGS[field].label).join(' | ')} |`,
      `| ${fields.map((field) => this.getAlignmentMarker(this.FIELD_CONFIGS[field].align)).join(' | ')} |`
    ]

    const rows = prs.map((pr) => `| ${fields.map((field) => this.formatPRCell(pr, field)).join(' | ')} |`)

    return [...header, ...rows].join('\n')
  }

  private static generateRepoTable(repos: RepoAggregate[], fieldsParam: string): string {
    const fields = this.parseFields(fieldsParam, this.REPO_FIELDS)

    const header = [
      `| ${fields.map((field) => this.FIELD_CONFIGS[field].label).join(' | ')} |`,
      `| ${fields.map((field) => this.getAlignmentMarker(this.FIELD_CONFIGS[field].align)).join(' | ')} |`
    ]

    const rows = repos.map((repo) => `| ${fields.map((field) => this.formatRepoCell(repo, field)).join(' | ')} |`)

    return [...header, ...rows].join('\n')
  }

  private static parseFields<T extends PRFieldKey | RepoFieldKey>(
    fieldsParam: string,
    availableFields: ReadonlySet<T>
  ): T[] {
    const fieldKeys = fieldsParam.split(',').map((field) => field.trim())
    const fields: T[] = []

    if (!fieldKeys.includes('repo')) {
      fields.push('repo' as T)
    }

    for (const key of fieldKeys) {
      if (availableFields.has(key as T)) {
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

  private static formatPRCell(pr: ProcessedPR, field: PRFieldKey): string {
    switch (field) {
      case 'repo':
        return `[${pr.repo}](https://github.com/${pr.repo})`
      case 'stars':
        return pr.stars.toString()
      case 'pr_title':
        return `[${this.escapeMarkdownCell(pr.pr_title)}](${pr.url})`
      case 'pr_number':
        return `[#${pr.pr_number}](${pr.url})`
      case 'status':
        return pr.status
      case 'created_date':
        return pr.created_date
      case 'merged_date':
        return pr.merged_date ?? '-'
    }
  }

  private static formatRepoCell(repo: RepoAggregate, field: RepoFieldKey): string {
    switch (field) {
      case 'repo':
        return `[${repo.repo}](https://github.com/${repo.repo})`
      case 'stars':
        return repo.stars.toString()
      case 'pr_numbers':
        return this.escapeMarkdownCell(repo.pr_numbers.map((num) => `#${num}`).join(', '))
      case 'total':
        return repo.total.toString()
      case 'merged':
        return repo.merged.toString()
      case 'open':
        return repo.open.toString()
      case 'draft':
        return repo.draft.toString()
      case 'closed':
        return repo.closed.toString()
      case 'merged_rate':
        return `${repo.merged_rate}%`
    }
  }
}
