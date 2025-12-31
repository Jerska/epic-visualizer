import { Version3Client } from 'jira.js';

const STORY_POINTS_FIELD = 'customfield_10033';

export async function fetchEpicIssues({ url, token, email, epicKey }) {
  const authentication = email
    ? { basic: { email, apiToken: token } } // Jira Cloud
    : { personalAccessToken: token }; // Jira Server/Data Center

  const client = new Version3Client({ host: url, authentication });

  // Try both JQL syntaxes (team-managed vs company-managed)
  const statusFilter = 'AND status NOT IN ("Won\'t Do", "Wontdo", "WONTDO", "Done", "DONE")';
  let issues = await searchIssues(client, `parent = ${epicKey} ${statusFilter}`);
  if (issues.length === 0) {
    issues = await searchIssues(client, `"Epic Link" = ${epicKey} ${statusFilter}`);
  }

  return issues.map(normalizeIssue);
}

async function searchIssues(client, jql) {
  const results = [];
  let nextPageToken = null;

  do {
    const params = {
      jql,
      fields: ['summary', 'status', 'issuelinks', STORY_POINTS_FIELD],
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
    blockedBy,
  };
}
