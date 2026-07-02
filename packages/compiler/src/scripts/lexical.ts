export function maskStringAndCommentText(source: string): string {
  let masked = "";
  let state: "code" | "single" | "double" | "template" | "lineComment" | "blockComment" = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "code") {
      if (char === "/" && next === "/") {
        masked += "  ";
        index += 1;
        state = "lineComment";
        continue;
      }
      if (char === "/" && next === "*") {
        masked += "  ";
        index += 1;
        state = "blockComment";
        continue;
      }
      if (char === "'") {
        masked += " ";
        state = "single";
        escaped = false;
        continue;
      }
      if (char === '"') {
        masked += " ";
        state = "double";
        escaped = false;
        continue;
      }
      if (char === "`") {
        masked += " ";
        state = "template";
        escaped = false;
        continue;
      }
      masked += char;
      continue;
    }

    if (state === "lineComment") {
      if (char === "\n" || char === "\r") {
        masked += char;
        state = "code";
      } else {
        masked += " ";
      }
      continue;
    }

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        masked += "  ";
        index += 1;
        state = "code";
      } else {
        masked += char === "\n" || char === "\r" ? char : " ";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      const terminator = state === "single" ? "'" : state === "double" ? '"' : "`";
      const isTerminator = char === terminator && !escaped;
      masked += char === "\n" || char === "\r" ? char : " ";
      escaped = char === "\\" && !escaped;
      if (isTerminator) {
        state = "code";
        escaped = false;
      } else if (char !== "\\") {
        escaped = false;
      }
    }
  }

  return masked;
}
