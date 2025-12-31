# epic-visualizer

CLI tool that displays the optimal sprint sequence for a JIRA epic, respecting "is blocked by" dependencies.

## Installation

```bash
npm install
```

## Usage

```bash
epic-visualizer -e https://your-jira.atlassian.net/browse/PROJ-123
```

## Options

| Option | Description |
|--------|-------------|
| `-e, --epic <url>` | Epic URL (required) |
| `-t, --token <token>` | JIRA API token (or `JIRA_TOKEN` env var) |
| `-u, --user <email>` | JIRA account email for Cloud (or `JIRA_USER` env var) |
| `-p, --points <n>` | Maximum total points per sprint |
| `-s, --seq <n>` | Maximum sequential points per sprint |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JIRA_TOKEN` | JIRA API token |
| `JIRA_USER` | JIRA account email (required for Cloud) |
| `JIRA_STORY_POINTS_FIELD` | Custom field ID for story points (default: `customfield_10033`) |
| `JIRA_RANK_FIELD` | Custom field ID for rank (default: `customfield_10011`) |
| `JIRA_EXCLUDE_STATUSES` | Comma-separated statuses to exclude (default: `Won't Do,Wontdo,WONTDO`) |
| `JIRA_DONE_STATUSES` | Comma-separated statuses considered "done" (default: `Done,DONE`) |

## Output

- Tasks are grouped into sprints respecting dependencies
- `★` marks tasks on the global critical path
- `│` `└` show the sprint's sequential chain
- Each sprint shows `seq/total pts` when parallelization is possible
