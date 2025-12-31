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

    // Calculate sequential points (sum of max points per level within sprint)
    // and mark tasks on the sprint's critical sequence
    const byLevel = new Map();
    for (const issue of sprint) {
      if (!byLevel.has(issue.level)) byLevel.set(issue.level, []);
      byLevel.get(issue.level).push(issue);
    }
    const maxPointsPerLevel = [...byLevel.values()].map((issues) => Math.max(...issues.map((i) => i.points)));
    const seqPoints = maxPointsPerLevel.reduce((sum, pts) => sum + pts, 0);

    // Mark one task per level for the sprint sequence (the one with max points)
    // Only mark if there are multiple levels (otherwise all tasks are parallel)
    const sprintCritical = new Set();
    if (byLevel.size > 1) {
      const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
      for (const lvl of sortedLevels) {
        const issues = byLevel.get(lvl);
        const maxPts = Math.max(...issues.map((i) => i.points));
        const maxIssue = issues.find((i) => i.points === maxPts);
        sprintCritical.add(maxIssue.key);
      }
    }

    console.log();
    console.log(chalk.cyan(line));
    const ptsDisplay = seqPoints < points ? `${seqPoints}/${points}` : `${points}`;
    console.log(
      chalk.cyan.bold(` Sprint ${i + 1}`) +
        chalk.gray(`${' '.repeat(Math.max(1, WIDTH - 18 - ptsDisplay.length))}${ptsDisplay} pts`)
    );
    console.log(chalk.cyan(line));

    // Sort: sequence issues first (by level), then non-sequence (by rank)
    const inSeq = (i) => sprintCritical.has(i.key);
    const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
    const byLevelAsc = (a, b) => a.level - b.level;
    const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
    const sortedSprint = [...sprint].sort((a, b) => bySeqFirst(a, b) || byLevelAsc(a, b) || byRank(a, b));

    // Build level info for box drawing - only connect different levels
    const seqTasks = sortedSprint.filter(inSeq);
    const seqLevels = [...new Set(seqTasks.map((i) => i.level))].sort((a, b) => a - b);
    const lastSeqLevel = seqLevels[seqLevels.length - 1];

    for (const issue of sortedSprint) {
      const isSprintCritical = inSeq(issue);
      const globalMarker = issue.critical ? chalk.red('★') : ' ';

      let sprintMarker = ' ';
      if (isSprintCritical && seqLevels.length > 1) {
        sprintMarker = issue.level === lastSeqLevel ? chalk.magenta('└') : chalk.magenta('│');
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
          isSprintCritical && seqLevels.length > 1 && issue.level !== lastSeqLevel ? chalk.magenta('│') : ' ';
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
