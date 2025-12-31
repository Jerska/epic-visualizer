#!/usr/bin/env node

import { program } from 'commander';
import { fetchEpicIssues } from './jira.js';
import { schedulesprints } from './scheduler.js';
import { displaySprints } from './display.js';

program
  .name('epic-visualizer')
  .description('Display optimal sprint sequence for a JIRA epic')
  .requiredOption('-e, --epic <key>', 'Epic key (e.g., PROJ-123) or full JIRA URL')
  .option('-t, --token <token>', 'JIRA API token (or set JIRA_TOKEN env var)')
  .option('--email <email>', 'JIRA account email (for Cloud, or set JIRA_EMAIL env var)')
  .option('-u, --url <url>', 'JIRA instance URL (extracted from epic URL if provided)')
  .option('-m, --max-points <number>', 'Maximum story points per sprint', parseFloat)
  .option('-s, --max-seq <number>', 'Maximum sequential points per sprint', parseFloat)
  .parse();

const opts = program.opts();

// Get token and email from options or environment
const token = opts.token || process.env.JIRA_TOKEN;
const email = opts.email || process.env.JIRA_EMAIL;

if (!token) {
  console.error('Error: JIRA token required. Use --token or set JIRA_TOKEN env var.');
  process.exit(1);
}

// Parse epic key and URL from input
let epicKey = opts.epic;
let jiraUrl = opts.url;

// Handle full JIRA URLs
const urlMatch = epicKey.match(/^(https?:\/\/[^/]+)\/.*\/([A-Z]+-\d+)/);
if (urlMatch) {
  jiraUrl = jiraUrl || urlMatch[1];
  epicKey = urlMatch[2];
}

if (!jiraUrl) {
  console.error('Error: JIRA URL required. Use --url or provide a full epic URL.');
  process.exit(1);
}

async function main() {
  try {
    const issues = await fetchEpicIssues({ url: jiraUrl, token, email, epicKey });

    if (issues.length === 0) {
      console.log('No issues found in epic.');
      return;
    }

    const sprints = schedulesprints(issues, opts.maxPoints, opts.maxSeq);
    displaySprints(sprints);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
