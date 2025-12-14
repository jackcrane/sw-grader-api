---
title: Creating an Assignment
---

FeatureBench is designed to help fit directly into your course's existing assignments.

## Prerequisites

Before you begin, you'll need to have a few things so you can create the assignment smoothly:

- A FeatureBench course ([creating a course](https://docs.featurebench.com/p/creating-a-course))
- An assignment name and optional description
- A due date
- (at least) a known-correct Solidworks part file ([signatures](#part-signatures))

## Creating an Assignment

### Assignment Details

Visit the course dashboard and go to the "Assignments" tab. Click the "New assignment" button at the top of the assignment list.

### Part Signatures

FeatureBench uses "part signatures" to autograde submissions. You are required to upload at least one part signature for each assignment. The first signature you upload will be used as the sample for "correct" submissions and student submissions will be compared against this signature.

You can upload as many more part signatures as you like. Adding more signatures allows:

- Specific feedback for common, specific mistakes
- Partial credit for simple errors
- Multiple correct variations to handle ambiguity in your assignments

Once your first part signature is uploaded, you can choose whether FeatureBench should handle each signature as a "correct" or "incorrect/partial" variation. If you choose "incorrect/partial", you will be able to specify a point value and specific feedback for each part signature.

At its core, each part signature requires the following information:

- **Unit system** - The intended unit system for the part. This can be set manually or inferred from the file.
- **Signature file** - The file containing the variant of the part.
- **Volume** - The volume of the part. This is automatically extracted from the file.
- **Surface area** - The surface area of the part. This is automatically extracted from the file.

If you set the signature type to "Incorrect/Partial", you will also need to provide:

- **Earned point value** - The number of points you want to award for submissions matching this part signature.
- **Feedback/Hints** - A bit of text that will be displayed to students who submit this variant of the part.

### Grading

Before you finalize your assignment, you will need to set the following details:

- **Tolerance percent** - The maximum percent difference allowed between the part signatures and teh student submissions. A small tolerance is required to handle rounding errors in the Solidworks mass property calculations. 0.1-0.15% is a good starting point, but if you find that correct answers are being marked incorrectly, you should increase this value.
- **Points possible** - The total number of available points for this assignment.

## Modifying an Assignment

Once you've created an assignment, you can modify it at any time. Simply go to the course dashboard, visit the "Assignments" tab, find the assignment you wish to modify in the list, and click the pencil icon.

This will allow you to edit assignment details, due date, and add or remove part signatures.

## Deleting an Assignment

You can delete an assignment at any time, but **this is permanent and cannot be undone**. Submissions for this assignment will immediately be made unavailable and it will no longer be considered in student grading.

## Identifying signature trends

FeatureBench can autoomatically identify trends in the parts your students submit. We check to see if multiple parts have the same volume and surface area. If so, we will let you know that a new trend has been identified. You can learn more about how this works [here](https://docs.featurebench.com/p/signature-trends).