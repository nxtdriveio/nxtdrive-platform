---
name: Task create-then-link atomicity
description: Why the entity-launcher createTask compensates with archive when the post-create link RPC fails.
---

# Create-then-link must compensate on failure

The "Taak aanmaken" entity launchers create a task via `create_task` and then
link it to the originating entity via `link_task_entity` in two separate RPC
calls (no single transactional RPC exists). If the link step fails, the action
archives the just-created task (`archive_task`) and returns the error.

**Why:** Without compensation a failed link leaves an orphan, unlinked task on
the board while the UI reports failure, and retries create duplicates. For the
launcher flow the link is the whole point, so a task with no link is wrong.

**How to apply:** Any future multi-step server action that creates a row and
then performs a dependent mutation should either use a single transactional RPC
or roll back the created row on the dependent step's failure. Don't return an
error while leaving partial state behind.
