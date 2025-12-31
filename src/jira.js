import { Version3Client } from 'jira.js';

const STORY_POINTS_FIELD = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10033';
const RANK_FIELD = process.env.JIRA_RANK_FIELD || 'customfield_10011';
const EXCLUDE_STATUSES = process.env.JIRA_EXCLUDE_STATUSES || "Won't Do,Wontdo,WONTDO";
const DONE_STATUSES = process.env.JIRA_DONE_STATUSES || 'Done,DONE';

export async function fetchEpicIssues({ url, token, user, epicKey }) {
  const authentication = user
    ? { basic: { email: user, apiToken: token } } // Jira Cloud
    : { personalAccessToken: token }; // Jira Server/Data Center

  const client = new Version3Client({ host: url, authentication });

  // Try both JQL syntaxes (team-managed vs company-managed)
  const excludeList = EXCLUDE_STATUSES.split(',').map((s) => `"${s.trim()}"`).join(', ');
  const statusFilter = `AND status NOT IN (${excludeList})`;
  let issues = await searchIssues(client, `parent = ${epicKey} ${statusFilter}`);
  if (issues.length === 0) {
    issues = await searchIssues(client, `"Epic Link" = ${epicKey} ${statusFilter}`);
  }

  const normalized = issues.map(normalizeIssue);
  const doneList = DONE_STATUSES.split(',').map((s) => s.trim().toLowerCase());
  const isDone = (issue) => doneList.includes((issue.status || '').toLowerCase());

  return {
    done: normalized.filter(isDone),
    pending: normalized.filter((i) => !isDone(i)),
  };
}

async function searchIssues(client, jql) {
  const results = [];
  let nextPageToken = null;

  do {
    const params = {
      jql,
      fields: ['summary', 'status', 'issuelinks', STORY_POINTS_FIELD, RANK_FIELD],
      maxResults: 100,
    };
    if (nextPageToken) params.nextPageToken = nextPageToken;

    const response = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost(params);

    results.push(...response.issues);
    nextPageToken = response.nextPageToken;
  } while (nextPageToken);

  return results;
}

function normalizeIssue(issue) {
  const blockedBy = (issue.fields.issuelinks || [])
    .filter((link) => link.type?.inward === 'is blocked by' && link.inwardIssue)
    .map((link) => link.inwardIssue.key);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    points: issue.fields[STORY_POINTS_FIELD] || 0,
    rank: issue.fields[RANK_FIELD] || '',
    blockedBy,
  };
}
