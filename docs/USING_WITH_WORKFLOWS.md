# Using with CI/CD Workflows

I will improve on this documentation later, but for now, this is the main process.

The process is as such:

- **Balancing job:** Create a job that runs load balancing for `X` runners against your chosen Cypress configuration.
  - If executed previously, download the persistent `.cypress_load_balancer/spec-map.json` file that contains previous
    result runs. This is how load balancing is processed and history is maintained.
  - Cypress configurations can be interchanged using their full path set with a Node.js environment variable of
    `CYPRESS_CONFIG_FILE`.
- **Parallelized testing jobs:** Create `X` parallelized jobs to run Cypress, where each job will be provided the subset
  of test files that were
  organized via the previous load balancing job.
  - _Job 1 gets the first test subset, Job 2 gets the second test subset, and so on_
  - Within this job, after each Cypress run completes, upload the `.cypress_load_balancer/spec-map.json` to a shared
    temporary.
    directory that can be accessed by the next workflow job. Make sure to rename all `spec-map.json` to be unique!
    - For example, `spec-map-job-1.json`, `spec-map-job-2.json`, etc.
- **Merge mapping job:** When all parallelized Cypress jobs complete, collect all of the `spec-map.json` files in the
  temporary directory, and
  run the `merge` command from the `cypress-load-balancer` CLI against those files in the temporary directory. This will
  merge their results back
  to the persistent mapping object.
  - Delete the temporary objects, if desired
  - Upload the merged persistent `.cypress_load_balancer/spec-map.json` to a shared location that can be accessed by
    the next run of this workflow. The results of the tests can now be used by future runs.
  - You may need to separate these maps by repository branch, and only merge them "down" to the trunk branch when
    needed. It is wise to default to the trunk branch's mapping file, if it exists, and only update the trunk's branch
    when either a workflow is run against it, or the current branch is merged down to the trunk, where the trunk
    branch's map can be replaced by one existing in the merged branch's stored location.
