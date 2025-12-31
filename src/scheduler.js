export function schedulesprints(issues, maxPoints) {
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  // Filter blockedBy to only include issues within the epic
  for (const issue of issues) {
    issue.blockedBy = issue.blockedBy.filter((key) => issueMap.has(key));
  }

  // Count how many issues each issue blocks (for prioritization)
  const blocksCount = new Map(issues.map((i) => [i.key, 0]));
  for (const issue of issues) {
    for (const blocker of issue.blockedBy) {
      blocksCount.set(blocker, blocksCount.get(blocker) + 1);
    }
  }

  detectCycles(issues);

  const sprints = [];
  const completed = new Set();

  while (completed.size < issues.length) {
    // Find issues with all blockers completed
    const available = issues.filter(
      (i) => !completed.has(i.key) && i.blockedBy.every((b) => completed.has(b))
    );

    if (available.length === 0) {
      throw new Error('Deadlock detected: no available issues but not all completed');
    }

    // Sort by: most blockers first (to unblock more work)
    available.sort((a, b) => blocksCount.get(b.key) - blocksCount.get(a.key));

    const sprint = [];
    let sprintPoints = 0;

    for (const issue of available) {
      const canFit = !maxPoints || sprintPoints + issue.points <= maxPoints;
      if (canFit) {
        sprint.push(issue);
        sprintPoints += issue.points;
        completed.add(issue.key);
      }
    }

    // Edge case: single issue exceeds max points, include it anyway
    if (sprint.length === 0 && available.length > 0) {
      sprint.push(available[0]);
      completed.add(available[0].key);
    }

    sprints.push(sprint);
  }

  return sprints;
}

function detectCycles(issues) {
  const visited = new Set();
  const recStack = new Set();

  function dfs(key, path) {
    if (recStack.has(key)) {
      const cycleStart = path.indexOf(key);
      const cycle = path.slice(cycleStart).concat(key);
      throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    }
    if (visited.has(key)) return;

    visited.add(key);
    recStack.add(key);

    const issue = issues.find((i) => i.key === key);
    if (issue) {
      for (const blocker of issue.blockedBy) {
        dfs(blocker, [...path, key]);
      }
    }

    recStack.delete(key);
  }

  for (const issue of issues) {
    if (!visited.has(issue.key)) {
      dfs(issue.key, []);
    }
  }
}
