import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

const results: string[] = [];

export default class AuthenticatedStatusReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status === "skipped" ? "BLOCKED" : result.status === test.expectedStatus ? "PASS" : "FAIL";
    results.push(`| ${test.title} | ${status} |`);
    console.log(`[${status}] ${test.title}`);
  }

  async onEnd(_result: FullResult) {
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Authenticated E2E\n\n| Caso | Resultado |\n| --- | --- |\n${results.join("\n")}\n`);
  }
}
