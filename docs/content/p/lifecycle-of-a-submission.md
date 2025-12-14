---
title: The lifecycle of a submission
---

Once your student submits a submission, it goes through several steps on the backend, both immediately when it is submitted and in the future. FeatureBench is a living platform and the constant flow and usage of submission data is important for us to maintain an engaging platform.

## The submission

Once a student uploads a file to an assignment their file is immediately persisted in our object storage server, the assignment is marked as submitted, and the assignment is queued for submission.

For teachers, this state will be denoted in the gradebook as a yellow cell with an hourglass icon, accompanied by the text "Awaiting Grading"

## The grading

Each grader "worker" server can only process one Solidworks submission file at a time, and each submission takes roughly 2-10 seconds depending on complexity and file size. As such, submissions are added to a queue and the grader servers handle one assignment at a time. While the queue is empty and files can be processed immediately in over 90% of cases, this architecture allows us to absorb spikes ensuring assignments can be submitted anytime by the student, but are graded as the grader servers come available.

The grader servers autoscale, meaning during normal usage conditions, we operate a single instance of the grader, but if the queue grows beyond certain thresholds, more instances of the grader will be automatically created and used, then destroyed as usage comes back down.

## The post-grading

Once we have extracted the metadata on the worker servers, we run our analysis on the submission:
- Matching it to recognized signatures and assigning a grade
- Scanning it for plagarism and entering into our index
- If not previously matched, attempting to match to other incorrect submissions to identify trends

Once an assignment is graded, it is marked in the gradebook with the number of points earned vs the points available. Students are not emailed to inform them of the grade.

*Right now, FeatureBench does not have a Canvas app, so automatic grade passback to Canvas is not available. Grade export to Canvas via CSV files [is supported](/p/migrating-to-canvas)*

## Continued usage

We will continue to work with your FeatureBench submissions to enable features like plagarism detection. If we roll out new features, we may make the decision to roll it out to existing/previous submissions, so we may re-run the grader worker on historical submissions. **For these historical submission re-runs, existing submissions will not be assigned new grades**.