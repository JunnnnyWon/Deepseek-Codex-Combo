export interface CommentFinding {
  readonly code: "ai_slop_comment";
  readonly line: number;
  readonly message: string;
}

export interface CommentCheckResult {
  readonly exitCode: 0 | 2;
  readonly findings: readonly CommentFinding[];
}

const slopPatterns: readonly RegExp[] = [
  /\bthis (function|method|class|file) (handles|contains|does|is used to)\b/i,
  /\badded by ai\b/i,
  /\btodo:\s*implement later\b/i,
  /\bskip(ping)? tests?\b/i,
  /^[-=/\\\s]{8,}$/,
];

const isCommentLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*");
};

const cleanComment = (line: string): string =>
  line
    .trim()
    .replace(/^\/\//, "")
    .replace(/^#/, "")
    .replace(/^\/\*/, "")
    .replace(/\*\/$/, "")
    .trim();

export const checkCommentText = (text: string): CommentCheckResult => {
  const findings: CommentFinding[] = [];
  const lines = text.split("\n");

  for (const [index, line] of lines.entries()) {
    if (!isCommentLine(line)) {
      continue;
    }

    const comment = cleanComment(line);
    if (slopPatterns.some((pattern) => pattern.test(comment))) {
      findings.push({
        code: "ai_slop_comment",
        line: index + 1,
        message: "Comment repeats obvious code behavior or leaves unsupported AI-style residue.",
      });
    }
  }

  return {
    exitCode: findings.length > 0 ? 2 : 0,
    findings,
  };
};
