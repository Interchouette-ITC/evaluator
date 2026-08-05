import type { StackFrame } from '@evaluator/shared-types';

/** Engine-agnostic console payload used to build MessageResult. */
export type ConsoleHit = {
  text: string;
  stackTrace: StackFrame[];
};
