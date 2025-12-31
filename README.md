# epic-visualizer

CLI tool that displays the optimal sprint sequence for a JIRA epic, respecting "is blocked by" dependencies.

## Installation

```bash
npm install
```

## Usage

```bash
node src/index.js --epic https://your-jira.atlassian.net/browse/PROJ-123 --seq 20 --points 40 --start 2026-01-01 --weeks 1
```

## Options

| Option | Description |
|--------|-------------|
| `-e, --epic <url>` | Epic URL (required) |
| `-t, --token <token>` | JIRA API token (or `JIRA_TOKEN` env var) |
| `-u, --user <email>` | JIRA account email for Cloud (or `JIRA_USER` env var) |
| `-p, --points <n>` | Maximum total points per sprint |
| `-s, --seq <n>` | Maximum sequential points per sprint |
| `-v, --verbose` | Show critical path details |
| `-d, --start <date>` | Sprint start date (YYYY-MM-DD) |
| `-w, --weeks <n>` | Sprint duration in weeks |

## Environment Variables

Environment variables can be set in a `.env` file in the project root. See `.env.example` for reference.

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
- Tasks sorted by sprint depth (how many tasks must complete first), grouped with `│` `└`
- First column: critical path step number (red)
- Second column: sprint depth number, `›` marks tasks in the longest sequence
- Each sprint shows `seq N pts · total N pts` when parallelization is possible
