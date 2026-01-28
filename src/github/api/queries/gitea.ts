// Gitea REST API query functions
// These functions replace GraphQL queries with REST API calls

import type { Octokit } from "@octokit/rest";

// Type definitions for REST API responses
type RestFile = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listFiles"]>
>["data"][number];
type RestComment = Awaited<
  ReturnType<Octokit["rest"]["issues"]["listComments"]>
>["data"][number];
type RestCommit = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listCommits"]>
>["data"][number];
type RestReview = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listReviews"]>
>["data"][number];
type RestReviewComment = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listReviewComments"]>
>["data"][number];

/**
 * Fetch complete Pull Request data including commits, files, comments, and reviews
 */
export async function fetchPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
) {
  // Fetch all PR data in parallel for better performance
  const [prData, prFiles, prComments, prCommits, prReviews] = await Promise.all(
    [
      // Basic PR information
      octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: number,
      }),
      // Changed files
      octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      }),
      // Issue comments (PR general comments)
      octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: number,
        per_page: 100,
      }),
      // PR commits
      octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      }),
      // PR reviews
      octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      }),
    ],
  );

  // Fetch review comments for each review using Gitea API
  // Gitea endpoint: GET /repos/{owner}/{repo}/pulls/{index}/reviews/{id}/comments
  const reviewsWithComments = await Promise.all(
    prReviews.data.map(async (review: RestReview) => {
      try {
        // Use Gitea-specific endpoint to get comments for each review
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments",
          {
            owner,
            repo,
            pull_number: number,
            review_id: review.id,
            per_page: 100,
          },
        );

        return {
          ...review,
          comments: response.data,
        };
      } catch (error) {
        // If fetching comments fails, return review with empty comments
        // @ts-expect-error - console is available at runtime
        console.warn(
          `Failed to fetch comments for review ${review.id}:`,
          error,
        );
        return {
          ...review,
          comments: [],
        };
      }
    }),
  );

  // Transform REST API response to match GraphQL-like structure
  return {
    repository: {
      pullRequest: {
        title: prData.data.title,
        body: prData.data.body || "",
        author: {
          login: prData.data.user?.login || "",
          name: prData.data.user?.name || undefined,
        },
        baseRefName: prData.data.base.ref,
        headRefName: prData.data.head.ref,
        headRefOid: prData.data.head.sha,
        createdAt: prData.data.created_at,
        updatedAt: prData.data.updated_at,
        lastEditedAt: prData.data.updated_at, // Gitea may not have separate lastEditedAt
        additions: prData.data.additions || 0,
        deletions: prData.data.deletions || 0,
        state: prData.data.state.toUpperCase(), // "open" -> "OPEN"
        commits: {
          totalCount: prCommits.data.length,
          nodes: prCommits.data.map((commit: RestCommit) => ({
            commit: {
              oid: commit.sha,
              message: commit.commit.message,
              author: {
                name: commit.commit.author?.name || "",
                email: commit.commit.author?.email || "",
              },
            },
          })),
        },
        files: {
          nodes: prFiles.data.map((file: RestFile) => ({
            path: file.filename,
            additions: file.additions,
            deletions: file.deletions,
            changeType: mapFileStatus(file.status),
          })),
        },
        comments: {
          nodes: prComments.data.map((comment: RestComment) => ({
            id: `comment_${comment.id}`,
            databaseId: comment.id,
            body: comment.body || "",
            author: {
              login: comment.user?.login || "",
            },
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            lastEditedAt: comment.updated_at,
            isMinimized: false, // Gitea may not support this
          })),
        },
        reviews: {
          nodes: reviewsWithComments.map(
            (review: RestReview & { comments: RestReviewComment[] }) => ({
              id: `review_${review.id}`,
              databaseId: review.id,
              author: {
                login: review.user?.login || "",
              },
              body: review.body || "",
              state: review.state.toUpperCase(), // "APPROVED", "CHANGES_REQUESTED", etc.
              submittedAt: review.submitted_at || review.created_at || "",
              updatedAt: review.submitted_at || review.created_at || "",
              lastEditedAt: review.submitted_at || review.created_at || "",
              comments: {
                nodes: review.comments.map((comment: RestReviewComment) => ({
                  id: `review_comment_${comment.id}`,
                  databaseId: comment.id,
                  body: comment.body || "",
                  path: comment.path,
                  line: comment.line || comment.original_line || null,
                  author: {
                    login: comment.user?.login || "",
                  },
                  createdAt: comment.created_at,
                  updatedAt: comment.updated_at,
                  lastEditedAt: comment.updated_at,
                  isMinimized: false,
                })),
              },
            }),
          ),
        },
      },
    },
  };
}

/**
 * Fetch complete Issue data including comments
 */
export async function fetchIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
) {
  // Fetch issue data and comments in parallel
  const [issueData, issueComments] = await Promise.all([
    octokit.rest.issues.get({
      owner,
      repo,
      issue_number: number,
    }),
    octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: number,
      per_page: 100,
    }),
  ]);

  // Transform REST API response to match GraphQL-like structure
  return {
    repository: {
      issue: {
        title: issueData.data.title,
        body: issueData.data.body || "",
        author: {
          login: issueData.data.user?.login || "",
        },
        createdAt: issueData.data.created_at,
        updatedAt: issueData.data.updated_at,
        lastEditedAt: issueData.data.updated_at,
        state: issueData.data.state.toUpperCase(),
        comments: {
          nodes: issueComments.data.map((comment: RestComment) => ({
            id: `comment_${comment.id}`,
            databaseId: comment.id,
            body: comment.body || "",
            author: {
              login: comment.user?.login || "",
            },
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            lastEditedAt: comment.updated_at,
            isMinimized: false,
          })),
        },
      },
    },
  };
}

/**
 * Fetch user display name
 */
export async function fetchUser(octokit: Octokit, login: string) {
  try {
    const userData = await octokit.rest.users.getByUsername({
      username: login,
    });

    return {
      user: {
        name: userData.data.name || userData.data.full_name || null,
      },
    };
  } catch (error) {
    // Note: console is available at runtime in Node.js environment
    // @ts-expect-error - console is not in lib but available at runtime
    console.warn(`Failed to fetch user ${login}:`, error);
    return {
      user: {
        name: null,
      },
    };
  }
}

/**
 * Map Gitea file status to GraphQL changeType format
 */
function mapFileStatus(status: string): string {
  const statusMap: Record<string, string> = {
    added: "ADDED",
    modified: "MODIFIED",
    removed: "DELETED",
    renamed: "RENAMED",
    copied: "COPIED",
    changed: "MODIFIED",
  };

  return statusMap[status] || status.toUpperCase();
}
