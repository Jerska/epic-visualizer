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
    const chainLength = new Map(); // Track longest chain ending at each issue

    // Calculate sequential points (longest chain) if we add an issue
    const getSeqPoints = (issue) => {
      // Find max chain length among blockers already in sprint
      const blockerChains = issue.blockedBy.filter((b) => sprintSet.has(b)).map((b) => chainLength.get(b) || 0);
      const maxBlockerChain = blockerChains.length > 0 ? Math.max(...blockerChains) : 0;
      const issueChainLength = maxBlockerChain + issue.points;

      // Current max chain in sprint
      const currentMax = chainLength.size > 0 ? Math.max(...chainLength.values()) : 0;
      return Math.max(currentMax, issueChainLength);
    };

    // Keep adding tasks until we can't add anymore (allows cascading within sprint)
    let changed = true;
    while (changed) {
      changed = false;

      // Find issues whose blockers are all completed OR in current sprint
      const notYetScheduled = (i) => !completed.has(i.key) && !sprintSet.has(i.key);
      const blockersResolved = (i) => i.blockedBy.every((b) => completed.has(b) || sprintSet.has(b));
      const available = issues.filter((i) => notYetScheduled(i) && blockersResolved(i));

      // Sort by: critical first, then lower level (to enable cascading), then most blockers
      const byCriticalFirst = (a, b) => (a.critical === b.critical ? 0 : a.critical ? -1 : 1);
      const byLevelAsc = (a, b) => a.level - b.level;
      const byBlockersDesc = (a, b) => blocks.get(b.key).length - blocks.get(a.key).length;
      available.sort((a, b) => byCriticalFirst(a, b) || byLevelAsc(a, b) || byBlockersDesc(a, b));

      for (const issue of available) {
        const fitsPoints = !maxPoints || sprintPoints + issue.points <= maxPoints;
        const fitsSeq = !maxSeq || getSeqPoints(issue) <= maxSeq;
        if (fitsPoints && fitsSeq) {
          sprint.push(issue);
          sprintSet.add(issue.key);
          sprintPoints += issue.points;
          // Update chain length for this issue
          const blockerChains = issue.blockedBy.filter((b) => sprintSet.has(b)).map((b) => chainLength.get(b) || 0);
          const maxBlockerChain = blockerChains.length > 0 ? Math.max(...blockerChains) : 0;
          chainLength.set(issue.key, maxBlockerChain + issue.points);
          changed = true;
        }
      }
    }

    // Edge case: single issue exceeds max points, include it anyway
    if (sprint.length === 0) {
      const available = issues.filter((i) => !completed.has(i.key) && i.blockedBy.every((b) => completed.has(b)));
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

// Find connected components (dependency groups) within a sprint
function findDependencyGroups(sprint) {
  const sprintKeys = new Set(sprint.map((i) => i.key));
  const issueMap = new Map(sprint.map((i) => [i.key, i]));

  // Build adjacency list (undirected - both directions count as connected)
  const adj = new Map();
  for (const issue of sprint) {
    if (!adj.has(issue.key)) adj.set(issue.key, new Set());
    for (const blocker of issue.blockedBy) {
      if (sprintKeys.has(blocker)) {
        adj.get(issue.key).add(blocker);
        if (!adj.has(blocker)) adj.set(blocker, new Set());
        adj.get(blocker).add(issue.key);
      }
    }
  }

  // Find connected components via DFS
  const visited = new Set();
  const groups = [];

  for (const issue of sprint) {
    if (visited.has(issue.key)) continue;

    const component = [];
    const stack = [issue.key];
    while (stack.length > 0) {
      const key = stack.pop();
      if (visited.has(key)) continue;
      visited.add(key);
      component.push(issueMap.get(key));
      for (const neighbor of adj.get(key) || []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }

    const points = component.reduce((sum, i) => sum + i.points, 0);
    groups.push({ tasks: component, points });
  }

  return groups;
}

// Assign tasks to people, minimizing inter-person dependencies
export function assignToPeople(sprint, maxSeq, numPeople) {
  if (!numPeople || numPeople <= 0) return null;

  const people = Array.from({ length: numPeople }, () => ({ tasks: [], points: 0 }));
  const assignment = new Map(); // key -> person index

  // Find connected components
  const groups = findDependencyGroups(sprint);

  // Sort groups by total points descending (assign biggest first)
  groups.sort((a, b) => b.points - a.points);

  for (const group of groups) {
    if (group.points <= maxSeq) {
      // Group fits in one person - find person with fewest points who can fit it
      const eligible = people
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => p.points + group.points <= maxSeq)
        .sort((a, b) => a.p.points - b.p.points);

      if (eligible.length > 0) {
        const { p, idx } = eligible[0];
        p.tasks.push(...group.tasks);
        p.points += group.points;
        for (const task of group.tasks) assignment.set(task.key, idx);
      } else {
        // No single person can fit - distribute to person with most capacity
        const byCapacity = people.map((p, idx) => ({ p, idx })).sort((a, b) => a.p.points - b.p.points);
        const { p, idx } = byCapacity[0];
        p.tasks.push(...group.tasks);
        p.points += group.points;
        for (const task of group.tasks) assignment.set(task.key, idx);
      }
    } else {
      // Group exceeds maxSeq - need to split
      // Sort tasks by dependency depth (tasks with no local blockers first)
      const sprintKeys = new Set(sprint.map((i) => i.key));
      const localDepth = new Map();

      function calcLocalDepth(task) {
        if (localDepth.has(task.key)) return localDepth.get(task.key);
        const localBlockers = task.blockedBy.filter((b) => sprintKeys.has(b));
        if (localBlockers.length === 0) {
          localDepth.set(task.key, 0);
          return 0;
        }
        const taskMap = new Map(group.tasks.map((t) => [t.key, t]));
        const maxBlockerDepth = Math.max(...localBlockers.map((b) => calcLocalDepth(taskMap.get(b))));
        const d = maxBlockerDepth + 1;
        localDepth.set(task.key, d);
        return d;
      }

      for (const task of group.tasks) calcLocalDepth(task);
      const sortedTasks = [...group.tasks].sort((a, b) => localDepth.get(a.key) - localDepth.get(b.key));

      // Greedily assign tasks to people
      for (const task of sortedTasks) {
        // Find person with fewest points who can fit this task
        const eligible = people
          .map((p, idx) => ({ p, idx }))
          .filter(({ p }) => p.points + task.points <= maxSeq)
          .sort((a, b) => a.p.points - b.p.points);

        if (eligible.length > 0) {
          const { p, idx } = eligible[0];
          p.tasks.push(task);
          p.points += task.points;
          assignment.set(task.key, idx);
        } else {
          // Overflow - assign to person with fewest points anyway
          const byCapacity = people.map((p, idx) => ({ p, idx })).sort((a, b) => a.p.points - b.p.points);
          const { p, idx } = byCapacity[0];
          p.tasks.push(task);
          p.points += task.points;
          assignment.set(task.key, idx);
        }
      }
    }
  }

  return assignment;
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
