import { defineEval } from "eve/evals";

// Verifies Cael routes an explicit task request to the add_todo tool and
// finishes the run. Note: this drives a real agent server, so it executes the
// tool for real (inserts a row via DATABASE_URL). Run against a dev/test DB.
export default defineEval({
  description: "An explicit task request triggers add_todo.",
  async test(t) {
    await t.send("Add a todo to buy milk tomorrow.");
    t.succeeded();
    t.calledTool("add_todo");
  },
});
