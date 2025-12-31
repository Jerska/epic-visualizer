export function schedulesprints(issues, maxPoints) {
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  // Filter blockedBy to only include issues within the epic
  for (const issue of issues) {
    issue.blockedBy = issue.blockedBy.filter((key) => issueMap.has(key));
  }

  // Build reverse dependency map (who does this issue block?)
  const blocks = new Map(issues.map((i) => [i.key, []]));
  for (const issue of issues) {
    for (const blocker of issue.blockedBy) {
      blocks.get(blocker).push(issue.key);
    }
  }

  detectCycles(issues);
  markCriticalPath(issues, issueMap, blocks);

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

    // Sort by: critical path first, then most blockers
    available.sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
      return blocks.get(b.key).length - blocks.get(a.key).length;
    });

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

function markCriticalPath(issues, issueMap, blocks) {
  // Compute level = earliest possible sprint (dependency depth)
  const level = new Map();

  function calcLevel(key) {
    if (level.has(key)) return level.get(key);

    const issue = issueMap.get(key);
    if (issue.blockedBy.length === 0) {
      level.set(key, 1);
      return 1;
    }

    const maxBlockerLevel = Math.max(...issue.blockedBy.map(calcLevel));
    const l = maxBlockerLevel + 1;
    level.set(key, l);
    return l;
  }

  for (const issue of issues) {
    calcLevel(issue.key);
  }

  // Max level = minimum possible sprints (ignoring capacity)
  const maxLevel = Math.max(...level.values());

  // Trace back from max-level tasks to find all tasks on critical paths
  const critical = new Set();

  function traceCritical(key) {
    if (critical.has(key)) return;
    critical.add(key);

    const issue = issueMap.get(key);
    // Follow blockers that are exactly one level back (on the critical chain)
    for (const blocker of issue.blockedBy) {
      if (level.get(blocker) === level.get(key) - 1) {
        traceCritical(blocker);
      }
    }
  }

  // Start from all tasks at max level
  for (const issue of issues) {
    if (level.get(issue.key) === maxLevel) {
      traceCritical(issue.key);
    }
  }

  for (const issue of issues) {
    issue.critical = critical.has(issue.key);
    issue.level = level.get(issue.key);
  }
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
