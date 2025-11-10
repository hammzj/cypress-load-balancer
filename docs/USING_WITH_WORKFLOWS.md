# Using with CI/CD Workflows

I will improve on this documentation later, but for now, this is the main process.

## Running parallelized tests

The process is as such:

- **Generate runner variables:** There are two ways to do this:
    - Use `npx cypress-load-balancer generate-runners <count>`. This creates an array of runner variables to use for
      each parallel runner process to iterated over when selecting which test files to execute.
    - Statically declare an array of runner variables to pass into the parallel runner processes. This removes the need
      for a separate job, but also is harder to update or change dynamically.
- **Parallelized testing jobs:** Create parallelized jobs from the `runner` variables that will execute
  `Cypress run --env runner={X}`,
  where each job will be provided the subset of test files that were organized via the previous load balancing job.
    - If executed previously, download the persistent `.cypress_load_balancer/spec-map.json` file that contains
      previous result runs before running the Cypress processs. This is how load balancing is processed and history is
      maintained.
    - Cypress configurations can be interchanged using their full path set with a Node.js environment variable of
      `process.env.CYPRESS_CONFIG_FILE`.
- **Merge temp maps back to man map:** When all parallelized Cypress jobs complete, collect all of the `spec-map.json`
  files in the
  temporary directory, and run `npx cypress-load-balancer merge -G .cypress_load_balancer/**/spec-map-*.json`. This
  will merge their results back to the persistent mapping object.
    - You may need to restore the main persistent `.cypress_load_balancer/spec-map.json` to this job before beginning
      merging, if it is not available.
        - You can delete the temporary objects with the flag `--rm` in the `merge` command. This only works if the
          temporary
          files exist in the `.cypress_load_balancer` directory.
    - Upload the merged `.cypress_load_balancer/spec-map.json` to a persisted location that can be accessed by
      the next run of this workflow. The results of the tests can now be used by future runs.
    - You may need to separate these maps by repository branch, and only merge them "down" to the trunk branch when
      needed. It is wise to default to the trunk branch's mapping file, if it exists, and only update the trunk's branch
      when either a workflow is run against it, or the current branch is merged down to the trunk, where the trunk
      branch's map can be replaced by one existing in the merged branch's stored location.

This is an example image of what a basic parallelized Cypress testing workflow will look like:

- `generate_runner_variables` creates the `--env runner` inputs
- `Cypress e2e tests (X/Y)` runs the subset of tests in parallel
- `merge_cypress_load_balancing_maps` collects the temporary spec maps and merges them back to the branch's load
  balancing map so new timings are collected.

![This is an example image of what a basic parallelized Cypress testing workflow will look like](img/parallel-testing-workflow.png)

## Saving the map from a pull request to the base branch

If running tests on pull requests, then it is important to merge the load balancing map created from it back down to the
map existing on the base branch of the pull request. Then, this merged map can be cached as the one to use for all new
test runs.

For instance,
see [save-map-to-base-branch-on-pr-merge.yml](../.github/workflows/save-map-to-base-branch-on-pr-merge.yml).

This is the general process in GitHub Actions, for example:

- When a pull request (PR) is closed AND also merged, then begin.
- Download the load balancing map saved from the **head branch/branch-being-merged** test run to the folder of
  `.cypress_load_balancer`.
    - _(Note: you must upload the map to that workflow run first!)_
- Download the main load balancing map from the **base/target** branch to `temp` folder.
- Merge them together using `npx cypress-load-balancer merge -G "./temp/**/spec-map.json"`.
- Save the merged load balancing map to the cache of the **base** branch. Potentially upload it to the workflow as well.

### Notice on GitHub Actions and caching

For GitHub Actions, the tests must be run on the base and head branches and upload their load balancer maps!
Caches cannot be accessed across feature branches.

> Access restrictions provide cache isolation and security by creating a logical boundary between different branches or
> tags. Workflow runs can restore caches created in either the current branch or the default branch (usually `main`). If
> a
> workflow run is triggered for a pull request, it can also restore caches created in the base branch, including base
> branches of forked repositories. For example, if the branch feature-b has the base branch feature-a, a workflow run
> triggered on a pull request would have access to caches created in the default main branch, the base feature-a branch,
> and the current feature-b branch.
>
> Workflow runs cannot restore caches created for child branches or sibling branches. For example, a cache created for
> the child `feature-b` branch would not be accessible to a workflow run triggered on the parent `main` branch.
> Similarly,
> a cache created for the feature-a branch with the base `main` would not be accessible to its sibling `feature-c`
> branch
> with the base main. Workflow runs also cannot restore caches created for different tag names. For example, a cache
> created for the tag release-a with the base main would not be accessible to a workflow run triggered for the tag
> release-b with the base main.
>
> When a cache is created by a workflow run triggered on a pull request, the cache is created for the merge ref (
> `refs/pull/.../merge`). Because of this, the cache will have a limited scope and can only be restored by re-runs of
> the
> pull request. It cannot be restored by the base branch or other pull requests targeting that base branch.
>
> Multiple workflow runs in a repository can share caches. A cache created for a branch in a workflow run can be
> accessed and restored from another workflow run for the same repository and branch.

Furthermore, GitHub Actions does not allow restoring from cache if the workflow is run with `on.pull_request`:

> When a cache is created by a workflow run triggered on a pull request, the cache is created for the merge ref (
> refs/pull/.../merge). Because of this, the cache will have a limited scope and can only be restored by re-runs of the
> pull request. It cannot be restored by the base branch or other pull requests targeting that base branch.

---

There are some ways to get around this.

First, when you need to update the load balancing map on your default trunk branch, you must run the
test workflows on both the current PR head branch **and** the base branch when merging is complete, and ensure that the
load balancing
map is uploaded as an artifact to the workflow!

Next, when merging them together in a separate workflow, instead of restoring them from cache, use [
`dawidd6/action-download-artifact@v8`](https://github.com/dawidd6/action-download-artifact)
to download each load balancing map. Then, you can merge them, and save it to cache (and potentially upload it to the
workflow.)

- See for more details.
    - https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache
    - https://github.com/actions/cache/blob/main/tips-and-workarounds.md#use-cache-across-feature-branches
    - https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching

## Reusing the balancing output for all attempts of a single workflow run

On GitHub Actions, new attempts of the same workflow can be rerun if needed, like if a job fails within a workflow. New
run attempts only apply to that particular workflow configuration. This is not the same as rerunning a new workflow
entirely, which may actually use newer versions of the repository and
produce different results than any previous workflow runs.

In this case, you will need to cache a load balancing map that will be reused for all run attempts of a workflow to
ensure that the same outputs from load balancing are reused correctly. You do not want unexpected changes where any
single runner will use different test files than its first attempt.

In the `example-parallel-testing-workflow.yml` file, there is a job named `save_original_map_for_all_attempts`.
This will instantiate a cached load balancing map with a key format ending in `ORIGINAL`, which can be reused for all run attempts.
It works as such:
1. If no cache-hit occurs for the `-ORIGINAL` key, check for the newest cached load balancing map, and save it with key format `cypress-load-balancer-map-${{ github.head_ref || github.ref_name }}-${{ github.run_id }}-ORIGINAL`.
2. When the parallelized testing jobs begin, restore the map using that `-ORIGINAL` key created earlier.
3. When merging mapping files from parallelized runs, restore the map using that `-ORIGINAL` key again, but save it with a key based on that run attempt of the workflow: ` cypress-load-balancer-map-${{ github.head_ref || github.ref_name }}-${{ github.run_id }}-${{ github.run_attempt }}` 

This process ensures that all run attempts use the same load balancing map for testing, but saves the results to a new cached file for that particular workflow run attempt. 
