# epic-visualizer

CLI tool that displays the optimal sprint sequence for a JIRA epic, respecting "is blocked by" dependencies.

## Installation

```bash
npm install
```

## Usage

```bash
# Using epic URL (extracts JIRA instance automatically)
epic-visualizer -e https://your-jira.atlassian.net/browse/PROJ-123

# Using epic key + explicit URL
epic-visualizer -e PROJ-123 -u https://your-jira.atlassian.net
```

## Options

| Option | Description |
|--------|-------------|
| `-e, --epic <key>` | Epic key or full JIRA URL (required) |
| `-t, --token <token>` | JIRA API token (or `JIRA_TOKEN` env var) |
| `--email <email>` | JIRA account email for Cloud (or `JIRA_EMAIL` env var) |
| `-u, --url <url>` | JIRA instance URL |
| `-m, --max-points <n>` | Maximum total points per sprint |
| `-s, --max-seq <n>` | Maximum sequential points per sprint |

## Output

- Tasks are grouped into sprints respecting dependencies
- `★` marks tasks on the global critical path
- `│` `└` show the sprint's sequential chain
- Each sprint shows `seq/total pts` when parallelization is possible
