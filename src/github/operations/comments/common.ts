import { GITHUB_SERVER_URL, USE_GITEA_API } from "../../api/config";

export const SPINNER_HTML =
  '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${jobRunUrl})`;
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = USE_GITEA_API
    ? createBranchUrl(owner, repo, branchName)
    : `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${branchName}`;
  return `\n[View branch](${branchUrl})`;
}

/**
 * Get the branch URL path segment for the current platform
 * Gitea uses /src/branch/ while GitHub uses /tree/
 */
export function getBranchPath(): string {
  const isGitea = !GITHUB_SERVER_URL.includes("github.com");
  return isGitea ? "src/branch" : "tree";
}

/**
 * Create a branch URL for the current platform
 */
export function createBranchUrl(
  owner: string,
  repo: string,
  branchName: string,
): string {
  return `${GITHUB_SERVER_URL}/${owner}/${repo}/${getBranchPath()}/${branchName}`;
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
): string {
  return `Claude Code is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
