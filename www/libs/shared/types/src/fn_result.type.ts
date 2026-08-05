export type Fn = {
  sha256: string;
  property: string;
  default: boolean;
  prototype?: boolean;
};

export type Functions = {
  [key: string]: Fn[];
};