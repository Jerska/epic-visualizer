#!/usr/bin/env node

import { program } from 'commander';
import { fetchEpicIssues } from './jira.js';
import { schedulesprints } from './scheduler.js';
import { displaySprints } from './display.js';

program
  .name('epic-visualizer')
  .description('Display optimal sprint sequence for a JIRA epic')
  .requiredOption('-e, --epic <url>', 'Epic URL (e.g., https://your-org.atlassian.net/browse/PROJ-123)')
  .option('-t, --token <token>', 'JIRA API token (or set JIRA_TOKEN env var)')
  .option('-u, --user <email>', 'JIRA account email (for Cloud, or set JIRA_USER env var)')
  .option('-p, --points <number>', 'Maximum story points per sprint', parseFloat)
  .option('-s, --seq <number>', 'Maximum sequential points per sprint', parseFloat)
  .parse();

const opts = program.opts();

// Get token and user from options or environment
const token = opts.token || process.env.JIRA_TOKEN;
const user = opts.user || process.env.JIRA_USER;

if (!token) {
  console.error('Error: JIRA token required. Use --token or set JIRA_TOKEN env var.');
  process.exit(1);
}

// Parse epic key and URL from input
const urlMatch = opts.epic.match(/^(https?:\/\/[^/]+)\/.*\/([A-Z]+-\d+)/);
if (!urlMatch) {
  console.error('Error: Invalid epic URL. Expected format: https://your-org.atlassian.net/browse/PROJ-123');
  process.exit(1);
}
const jiraUrl = urlMatch[1];
const epicKey = urlMatch[2];

async function main() {
  try {
    const issues = await fetchEpicIssues({ url: jiraUrl, token, user, epicKey });

    if (issues.length === 0) {
      console.log('No issues found in epic.');
      return;
    }

    const sprints = schedulesprints(issues, opts.points, opts.seq);
    displaySprints(sprints);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
