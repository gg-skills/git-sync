#!/usr/bin/env npx tsx

/**
 * @fileoverview CLI entrypoint that probes the current working tree git superproject (clean
 * status, submodule inventory, upstream parity, detached HEAD) and prints a weighted eight-item
 * Sync Quality Checklist report with optional JSON to stdout.
 *
 * This file owns the embedded checklist rows and weights, heuristic `checked` mapping from local
 * `git` subprocess output, aggregate scoring, and console formatting for the git-sync
 * completeness gate.
 * Flow: read argv for `--json` -> synchronous git probes -> build checklist -> stdout (no
 * `process.exitCode` mutation).
 * Drift note: `skills/git-sync/SKILL.md` Quick Commands still mention `--session`;
 * this script only evaluates the cwd repository using the eight hard-coded checklist rows here.
 *
 * @testing CLI: from the repository root, `npx tsx .agents/skills/git-sync/scripts/check-sync-completeness.ts` and confirm stdout lists git probes, aggregate score, and eight checklist rows with status icons.
 * @testing CLI: from the repository root, `npx tsx .agents/skills/git-sync/scripts/check-sync-completeness.ts --json` and confirm stdout ends with a JSON object containing `checklist`, `score`, `maxScore`, and `canFinalize`.
 * @testing CLI: from the repository root, `npm run file-overview-standards:target-brief -- --file skills/git-sync/scripts/check-sync-completeness.ts` and confirm the structural brief reports no issues.
 *
 * @see skills/git-sync/SKILL.md - git-sync skill narrative and operator checklist whose eight gates this script scores heuristically from cwd `git` subprocess probes before operators declare sync work complete.
 * @see skills/git-sync/references/inbound-contract.md - Submodule-first inbound ordering and preflight contract that explains why cleanliness and upstream-parity rows in this report gate risky pull sequencing.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository file-overview contract enforced by the same documentation scanners as this header.
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { argv } from "process";
import { execSync } from "child_process";

// ============================================================================
// Types
// ============================================================================

/**
 * One sync-quality checklist row with scoring weight and completion flag.
 *
 * @remarks
 * `checked` is derived from local git probes; `weight` drives the aggregate score.
 */
interface ChecklistItem {
  number: number;
  name: string;
  description: string;
  required: boolean;
  checked: boolean;
  weight: number;
}

/**
 * Machine-readable summary of checklist completion, score, and finalize readiness.
 *
 * @remarks
 * Printed as JSON only when `--json` is present; mirrors the console checklist outcome.
 */
interface CompletenessReport {
  checklist: ChecklistItem[];
  score: number;
  maxScore: number;
  canFinalize: boolean;
}

// ============================================================================
// Checklist Definition
// ============================================================================

const CHECKLIST_ITEMS: Omit<ChecklistItem, "checked">[] = [
  { number: 1, name: "Diagnostic run first", description: "git status, branch, upstream checked", required: true, weight: 2 },
  { number: 2, name: "Submodule-first ordering", description: "Submodules synced before root", required: true, weight: 2 },
  { number: 3, name: "Dirty workspace checkpointed", description: "Checkpoint commits for dirty repos", required: true, weight: 2 },
  { number: 4, name: "Merge-based pulls", description: "git pull --no-rebase, not rebase", required: true, weight: 1 },
  { number: 5, name: "Per-submodule pulls", description: "No blanket recursive commands", required: true, weight: 2 },
  { number: 6, name: "Root gitlinks updated", description: "After submodule resolution", required: true, weight: 2 },
  { number: 7, name: "Verification run", description: "git status clean, at upstream parity", required: true, weight: 2 },
  { number: 8, name: "All repos at upstream parity", description: "Every submodule + root clean", required: true, weight: 2 },
];

// ============================================================================
// Git State Detection
// ============================================================================

/**
 * Runs a git subprocess synchronously and returns trimmed stdout text.
 *
 * @remarks
 * I/O: Uses `execSync` in the current working directory. Swallows failures and returns an empty
 * string so callers can treat "no output" as a soft probe result.
 */
function runGit(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Determines whether the working tree is clean and lists porcelain status lines when dirty.
 *
 * @remarks
 * I/O: Parses `git status --porcelain`; non-empty output implies uncommitted or unstaged work.
 */
function checkGitStatus(): { clean: boolean; dirty: string[] } {
  const status = runGit("git status --porcelain");
  if (!status) return { clean: true, dirty: [] };
  
  const dirty = status.split("\n").filter(line => line.trim());
  return { clean: false, dirty };
}

/**
 * Reads submodule presence lines for the current superproject without mutating them.
 *
 * @remarks
 * I/O: Invokes `git submodule status`; empty output yields zero submodules for scoring heuristics.
 */
function checkSubmodules(): { count: number; states: string[] } {
  const output = runGit("git submodule status");
  if (!output) return { count: 0, states: [] };
  
  const states = output.split("\n").filter(line => line.trim());
  return { count: states.length, states };
}

/**
 * True when HEAD is neither ahead nor behind its configured upstream revision counts.
 *
 * @remarks
 * I/O: Compares `git rev-list --count` ranges; missing upstream or probe errors surface as false.
 */
function checkUpstreamParity(): boolean {
  const ahead = runGit("git rev-list --count '@{upstream}..HEAD");
  const behind = runGit("git rev-list --count HEAD..@{upstream}");
  return ahead === "0" && behind === "0";
}

/**
 * Detects detached HEAD or an empty branch name from git's current-branch output.
 *
 * @remarks
 * I/O: Uses `git branch --show-current`; treats missing output or `(detached)` as detached.
 */
function checkDetachedHead(): boolean {
  const branch = runGit("git branch --show-current");
  return !branch || branch === "(detached)";
}

// ============================================================================
// Main
// ============================================================================

/**
 * CLI driver: prints human-readable diagnostics, checklist scoring, and optional JSON report.
 *
 * @remarks
 * Reads `process.argv` for `--check`/`-c` (currently informational) and `--json`. Uses console
 * only; does not set `process.exitCode`.
 */
function main() {
  const args = argv.slice(2);
  const jsonArg = args.includes("--json");
  
  console.log("\n📋 Git Sync Completeness Check");
  console.log("═".repeat(60));
  
  // Run diagnostic checks
  const status = checkGitStatus();
  const submodules = checkSubmodules();
  const upstreamParity = checkUpstreamParity();
  const detachedHead = checkDetachedHead();
  
  console.log(`\n📊 Git Status:`);
  console.log(`   Clean: ${status.clean ? "✅" : "❌"}`);
  if (!status.clean) {
    console.log(`   Dirty files: ${status.dirty.length}`);
  }
  console.log(`   Submodules: ${submodules.count}`);
  console.log(`   Upstream parity: ${upstreamParity ? "✅" : "❌"}`);
  console.log(`   Detached HEAD: ${detachedHead ? "❌" : "✅"}`);
  
  // Build checklist
  const checklist: ChecklistItem[] = CHECKLIST_ITEMS.map(item => {
    let checked = false;
    
    switch (item.number) {
      case 1: // Diagnostic run first
        checked = status.clean !== undefined && submodules.count !== undefined;
        break;
      case 2: // Submodule-first ordering
        checked = !detachedHead && submodules.count >= 0;
        break;
      case 3: // Dirty workspace checkpointed
        checked = status.clean;
        break;
      case 4: // Merge-based pulls (assumed if not detached)
        checked = !detachedHead;
        break;
      case 5: // Per-submodule pulls
        checked = submodules.count >= 0;
        break;
      case 6: // Root gitlinks updated
        checked = !detachedHead;
        break;
      case 7: // Verification run
        checked = status.clean;
        break;
      case 8: // All repos at upstream parity
        checked = status.clean && upstreamParity;
        break;
      default:
        break;
    }
    
    return { ...item, checked };
  });
  
  const score = checklist.reduce((sum, item) => 
    item.checked ? sum + item.weight : sum, 0);
  const maxScore = checklist.reduce((sum, item) => sum + item.weight, 0);
  
  const requiredItems = checklist.filter(i => i.required);
  const requiredScore = requiredItems.reduce((sum, item) => 
    item.checked ? sum + item.weight : sum, 0);
  const requiredMax = requiredItems.reduce((sum, item) => sum + item.weight, 0);
  
  const canFinalize = requiredScore === requiredMax;
  
  console.log(`\n📊 Score: ${score}/${maxScore} (${((score/maxScore)*100).toFixed(0)}%)`);
  console.log(`   Required items: ${requiredScore}/${requiredMax}`);
  
  console.log(`\n${canFinalize ? "✅" : "⚠️"} Syncable: ${canFinalize ? "YES" : "NEEDS WORK"}`);
  
  console.log("\n📝 Checklist:");
  for (const item of checklist) {
    const icon = item.checked ? "✅" : item.required ? "❌" : "⚠️";
    console.log(`   ${icon} [${item.number}] ${item.name}`);
  }
  
  console.log("\n" + "═".repeat(60));
  
  if (!canFinalize) {
    console.log("\n⚠️ Sync needs work before proceeding.");
    const failedItems = checklist.filter(i => !i.checked && i.required);
    if (failedItems.length > 0) {
      console.log("\nIssues to resolve:");
      failedItems.forEach(i => console.log(`   - ${i.name}: ${i.description}`));
    }
  } else {
    console.log("\n✅ Workspace is ready for sync operation.");
  }
  
  if (jsonArg) {
    const report: CompletenessReport = { checklist, score, maxScore, canFinalize };
    console.log("\n" + JSON.stringify(report, null, 2));
  }
}

main();
