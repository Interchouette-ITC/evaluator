export type Result = string | number | object;

export type StackFrame = {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type MessageResult = {
  sha256: string;
  result: Result[];
  result_unpack?: Result[];
  stacktrace: StackFrame[];
  stacktrace_as_string?: string;
  caller: string;
};
