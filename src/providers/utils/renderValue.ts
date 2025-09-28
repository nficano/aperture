const JSON_INDENT = 2;

const ensureNewlineAfter = (value: string, token: "{" | "["): string => {
  if (!value.startsWith(token)) return value;
  if (value[1] === "\n") return value;
  return `${token}\n${value.slice(1)}`;
};

const ensureNewlineBefore = (value: string, token: "}" | "]"): string => {
  if (!value.endsWith(token)) return value;
  if (value[value.length - 2] === "\n") return value;
  return `${value.slice(0, -1)}\n${token}`;
};

const addOuterBracketPadding = (value: string): string => {
  let formatted = ensureNewlineAfter(value, "{");
  formatted = ensureNewlineAfter(formatted, "[");
  formatted = ensureNewlineBefore(formatted, "}");
  formatted = ensureNewlineBefore(formatted, "]");
  return formatted;
};

const tryFormatJsonString = (value: string, indent: number): string | null => {
  if (indent === 0) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const serialized = JSON.stringify(parsed, null, indent);
    return addOuterBracketPadding(serialized);
  } catch {
    return null;
  }
};

export const renderValue = (value: unknown, pretty: boolean): string => {
  const indent = pretty ? JSON_INDENT : 0;

  if (typeof value === "string") {
    const formatted = tryFormatJsonString(value, indent);
    return formatted ?? value;
  }

  try {
    const serialized = JSON.stringify(value, null, indent);
    if (serialized) {
      return indent > 0 ? addOuterBracketPadding(serialized) : serialized;
    }
  } catch {
    // ignore JSON failures and fall back to string conversion
  }

  return String(value);
};
