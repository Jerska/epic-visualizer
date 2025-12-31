import chalk from 'chalk';

const WIDTH = Math.min(process.stdout.columns || 100, 120);
const MARKER_WIDTH = 3; // globalMarker + sprintMarker + space
const KEY_WIDTH = 12;
const POINTS_WIDTH = 6;
const PADDING = 4; // 2 spaces indent + 2 spaces between parts
const SUMMARY_WIDTH = WIDTH - MARKER_WIDTH - KEY_WIDTH - POINTS_WIDTH - PADDING;

export function displaySprints(sprints) {
  const line = '━'.repeat(WIDTH);
  let totalPoints = 0;
  const criticalByLevel = new Map();

  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    const points = sprint.reduce((sum, issue) => sum + issue.points, 0);
    totalPoints += points;

    // Calculate chain lengths based on actual dependencies within sprint
    const sprintKeys = new Set(sprint.map((i) => i.key));
    const chainLength = new Map();
    const chainPrev = new Map(); // Track which blocker contributes to longest chain

    // Process in level order to ensure blockers are processed first
    const sortedByLevel = [...sprint].sort((a, b) => a.level - b.level);
    for (const issue of sortedByLevel) {
      const blockersInSprint = issue.blockedBy.filter((b) => sprintKeys.has(b));
      if (blockersInSprint.length === 0) {
        chainLength.set(issue.key, issue.points);
        chainPrev.set(issue.key, null);
      } else {
        const blockerChains = blockersInSprint.map((b) => ({ key: b, len: chainLength.get(b) || 0 }));
        const maxBlocker = blockerChains.reduce((a, b) => (a.len >= b.len ? a : b));
        chainLength.set(issue.key, maxBlocker.len + issue.points);
        chainPrev.set(issue.key, maxBlocker.key);
      }
    }

    // Find longest chain and trace back to mark critical sequence
    const seqPoints = Math.max(...chainLength.values());
    const sprintCritical = new Set();
    if (sprint.length > 1) {
      // Find end of longest chain
      let current = [...chainLength.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
      while (current) {
        sprintCritical.add(current);
        current = chainPrev.get(current);
      }
    }

    console.log();
    console.log(chalk.cyan(line));
    const ptsDisplay = seqPoints < points ? `seq ${seqPoints} · total ${points} pts` : `${points} pts`;
    console.log(
      chalk.cyan.bold(` Sprint ${i + 1}`) +
        chalk.gray(`${' '.repeat(Math.max(1, WIDTH - 12 - ptsDisplay.length))}${ptsDisplay}`)
    );
    console.log(chalk.cyan(line));

    // Sort: sequence issues first (by chain position), then non-sequence (by rank)
    const inSeq = (i) => sprintCritical.has(i.key);
    const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
    const byChainLength = (a, b) => (chainLength.get(a.key) || 0) - (chainLength.get(b.key) || 0);
    const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
    const sortedSprint = [...sprint].sort((a, b) => bySeqFirst(a, b) || byChainLength(a, b) || byRank(a, b));

    // Find the last task in the sequence chain
    const seqTasks = sortedSprint.filter(inSeq);
    const lastSeqKey = seqTasks.length > 0 ? seqTasks[seqTasks.length - 1].key : null;

    for (const issue of sortedSprint) {
      const isSprintCritical = inSeq(issue);
      const globalMarker = issue.critical ? chalk.red('★') : ' ';

      let sprintMarker = ' ';
      if (isSprintCritical && seqTasks.length > 1) {
        sprintMarker = issue.key === lastSeqKey ? chalk.magenta('└') : chalk.magenta('│');
      }

      let keyPart = chalk.yellow(issue.key.padEnd(KEY_WIDTH));
      if (issue.critical) {
        keyPart = chalk.red.bold(issue.key.padEnd(KEY_WIDTH));
      } else if (isSprintCritical) {
        keyPart = chalk.magenta(issue.key.padEnd(KEY_WIDTH));
      }

      const summaryPart = truncate(issue.summary, SUMMARY_WIDTH);
      const pointsPart = chalk.gray(`${issue.points}pts`.padStart(POINTS_WIDTH));
      console.log(` ${globalMarker}${sprintMarker} ${keyPart}${summaryPart} ${pointsPart}`);

      if (issue.blockedBy.length > 0) {
        const blockers = issue.blockedBy.map((k) => k.replace(/^[A-Z]+-/, '')).join(', ');
        const continueMarker =
          isSprintCritical && seqTasks.length > 1 && issue.key !== lastSeqKey ? chalk.magenta('│') : ' ';
        console.log(`  ${continueMarker}` + chalk.gray(`${' '.repeat(KEY_WIDTH)}← blocked by ${blockers}`));
      }

      if (issue.critical) {
        if (!criticalByLevel.has(issue.level)) {
          criticalByLevel.set(issue.level, []);
        }
        criticalByLevel.get(issue.level).push(issue);
      }
    }
  }

  console.log();
  console.log(chalk.green.bold(`Total: ${sprints.length} sprints, ${totalPoints} points`));

  // Display critical path grouped by level
  if (criticalByLevel.size > 0) {
    const levels = [...criticalByLevel.keys()].sort((a, b) => a - b);
    const maxPointsPerLevel = levels.map((lvl) => Math.max(...criticalByLevel.get(lvl).map((i) => i.points)));
    const minPoints = maxPointsPerLevel.reduce((sum, pts) => sum + pts, 0);

    console.log();
    console.log(chalk.red(`★ Critical path: ${levels.length} levels, ${minPoints} pts minimum`));

    const maxLevelWidth = String(levels.length).length;
    const maxPtsWidth = Math.max(...levels.map((lvl) => {
      const issues = criticalByLevel.get(lvl);
      return String(Math.max(...issues.map((i) => i.points))).length;
    }));

    for (const lvl of levels) {
      const issues = criticalByLevel.get(lvl);
      const keys = issues.map((i) => i.key.replace(/^[A-Z]+-/, '')).join(', ');
      const maxPts = Math.max(...issues.map((i) => i.points));
      const parallel = issues.length > 1 ? chalk.gray(' (parallel)') : '';
      const lvlStr = String(lvl).padStart(maxLevelWidth);
      const ptsStr = String(maxPts).padStart(maxPtsWidth);
      console.log(chalk.gray(`  ${lvlStr}. `) + chalk.white(ptsStr) + chalk.gray(` pts → `) + chalk.white(`[${keys}]`) + parallel);
    }
  }
}

function truncate(str, len) {
  if (str.length <= len) return str.padEnd(len);
  return str.slice(0, len - 1) + '…';
}
