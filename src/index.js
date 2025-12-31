#!/usr/bin/env node

import 'dotenv/config';
import { program } from 'commander';
import { fetchEpicIssues } from './jira.js';
import { scheduleSprints } from './scheduler.js';
import { displayCompleted, displaySprints } from './display.js';

program
  .name('epic-visualizer')
  .description('Display optimal sprint sequence for a JIRA epic')
  .requiredOption('-e, --epic <url>', 'Epic URL (e.g., https://your-org.atlassian.net/browse/PROJ-123)')
  .option('-t, --token <token>', 'JIRA API token (or set JIRA_TOKEN env var)')
  .option('-u, --user <email>', 'JIRA account email (for Cloud, or set JIRA_USER env var)')
  .option('-p, --points <number>', 'Maximum story points per sprint', parseFloat)
  .option('-s, --seq <number>', 'Maximum sequential points per sprint', parseFloat)
  .option('-v, --verbose', 'Show critical path details')
  .option('-d, --start <date>', 'Sprint start date (YYYY-MM-DD)')
  .option('-w, --weeks <number>', 'Sprint duration in weeks', parseFloat)
  .parse();

const opts = program.opts();

// Get token and user from options or environment
const token = opts.token || process.env.JIRA_TOKEN;
const user = opts.user || process.env.JIRA_USER;

if (!token) {
  console.error('Error: JIRA token required. Use -t/--token or set JIRA_TOKEN env var.');
  process.exit(1);
}

if (opts.points !== undefined && (isNaN(opts.points) || opts.points <= 0)) {
  console.error('Error: -p/--points must be a positive number.');
  process.exit(1);
}

if (opts.seq !== undefined && (isNaN(opts.seq) || opts.seq <= 0)) {
  console.error('Error: -s/--seq must be a positive number.');
  process.exit(1);
}

if (opts.start !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opts.start)) {
  console.error('Error: -d/--start must be a valid date (YYYY-MM-DD).');
  process.exit(1);
}

if (opts.weeks !== undefined && (isNaN(opts.weeks) || opts.weeks <= 0)) {
  console.error('Error: -w/--weeks must be a positive number.');
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

try {
  const { done, pending } = await fetchEpicIssues({ url: jiraUrl, token, user, epicKey });

  if (done.length === 0 && pending.length === 0) {
    console.log('No issues found in epic.');
    process.exit(0);
  }

  if (done.length > 0) {
    displayCompleted(done);
  }

  if (pending.length > 0) {
    const sprints = scheduleSprints(pending, opts.points, opts.seq);
    displaySprints(sprints, {
      verbose: opts.verbose,
      startDate: opts.start,
      sprintWeeks: opts.weeks,
    });
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
