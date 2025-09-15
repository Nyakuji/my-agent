import { tool, streamText } from "ai";
import { google } from "@ai-sdk/google";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { writeFile } from "fs/promises";
import { COMMIT_MESSAGE_PROMPT } from "./prompts";

const excludeFiles = ["dist", "bun.lock"];

const fileChange = z.object({
  rootDir: z.string().min(1).describe("The root directory"),
});

const markdownFile = z.object({
  filePath: z.string().min(1).describe("The path to the markdown file"),
  content: z.string().min(1).describe("The content of the markdown file"),
});

type FileChange = z.infer<typeof fileChange>;
type MarkdownFile = z.infer<typeof markdownFile>;

async function getFileChangesInDirectory({ rootDir }: FileChange) {
  const git = simpleGit(rootDir);
  const summary = await git.diffSummary();
  const diffs: { file: string; diff: string }[] = [];

  for (const file of summary.files) {
    if (excludeFiles.includes(file.file)) continue;
    const diff = await git.diff(["--", file.file]);
    diffs.push({ file: file.file, diff });
  }

  return diffs;
}

async function createMarkdownFile({ filePath, content }: MarkdownFile) {
  await writeFile(filePath, content);
  return { success: true };
}

export const getFileChangesInDirectoryTool = tool({
  description: "Gets the code changes made in given directory",
  inputSchema: fileChange,
  execute: getFileChangesInDirectory,
});

export const createMarkdownFileTool = tool({
  description: "Creates a markdown file",
  inputSchema: markdownFile,
  execute: createMarkdownFile,
});

export const generateCommitMessageTool = tool({
  description: "Generates a commit message from the git diff",
  inputSchema: fileChange,
  execute: async ({ rootDir }) => {
    const diffs = await getFileChangesInDirectory({ rootDir });
    const { textStream } = await streamText({
      model: google("models/gemini-1.5-flash"),
      system: COMMIT_MESSAGE_PROMPT,
      prompt: `Here are the code changes:

${diffs
        .map((d) => d.diff)
        .join("\n\n")}`,
    });

    let message = "";
    for await (const chunk of textStream) {
      message += chunk;
    }

    return { message };
  },
});


