import { defineOpenAPIConnection } from "eve/connections";
import { once } from "eve/tools/approval";

export default defineOpenAPIConnection({
  spec: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
  baseUrl: "https://api.github.com",
  description:
    "GitHub: read and write files, create commits, push to branches, open pull requests, manage issues in the bertovmill/focuspoint repo.",
  auth: {
    getToken: async () => ({ token: process.env.GITHUB_TOKEN! }),
  },
  // Ask once per session before any write operation
  approval: once(),
});
