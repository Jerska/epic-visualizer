export function scheduleSprints(issues, maxPoints, maxSeq) {
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
    const sprint = [];
    const sprintSet = new Set();
    let sprintPoints = 0;
    const maxPointsByLevel = new Map(); // Track max points per level for seq calculation

    // Calculate sequential points if we add an issue
    const getSeqPoints = (issue) => {
      const currentMax = maxPointsByLevel.get(issue.level) || 0;
      const newMax = Math.max(currentMax, issue.points);
      const delta = newMax - currentMax;
      return [...maxPointsByLevel.values()].reduce((sum, pts) => sum + pts, 0) + delta;
    };

    // Keep adding tasks until we can't add anymore (allows cascading within sprint)
    let changed = true;
    while (changed) {
      changed = false;

      // Find issues whose blockers are all completed OR in current sprint
      const available = issues.filter(
        (i) =>
          !completed.has(i.key) &&
          !sprintSet.has(i.key) &&
          i.blockedBy.every((b) => completed.has(b) || sprintSet.has(b))
      );

      // Sort by: critical first, then lower level (to enable cascading), then most blockers
      available.sort((a, b) => {
        if (a.critical !== b.critical) return a.critical ? -1 : 1;
        if (a.level !== b.level) return a.level - b.level;
        return blocks.get(b.key).length - blocks.get(a.key).length;
      });

      for (const issue of available) {
        const fitsPoints = !maxPoints || sprintPoints + issue.points <= maxPoints;
        const fitsSeq = !maxSeq || getSeqPoints(issue) <= maxSeq;
        if (fitsPoints && fitsSeq) {
          sprint.push(issue);
          sprintSet.add(issue.key);
          sprintPoints += issue.points;
          const currentMax = maxPointsByLevel.get(issue.level) || 0;
          maxPointsByLevel.set(issue.level, Math.max(currentMax, issue.points));
          changed = true;
        }
      }
    }

    // Edge case: single issue exceeds max points, include it anyway
    if (sprint.length === 0) {
      const available = issues.filter(
        (i) => !completed.has(i.key) && i.blockedBy.every((b) => completed.has(b))
      );
      if (available.length === 0) {
        throw new Error('Deadlock detected: no available issues but not all completed');
      }
      sprint.push(available[0]);
    }

    // Mark all sprint tasks as completed
    for (const issue of sprint) {
      completed.add(issue.key);
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
