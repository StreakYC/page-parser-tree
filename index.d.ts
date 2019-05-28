import { TagTree } from 'tag-tree';

export type Selector =
  | string
  | { $filter: (el: HTMLElement) => boolean }
  | { $map: (el: HTMLElement) => null | undefined | HTMLElement }
  | {
      $watch: {
        attributeFilter: string[];
        cond: string | ((el: HTMLElement) => boolean);
      };
    }
  | { $or: Array<Array<Selector>> }
  | { $log: string };

export interface Watcher {
  sources: Array<string | null>;
  tag: string;
  selectors: Array<Selector>;
}

export interface Finder {
  fn(root: HTMLElement): Array<HTMLElement> | NodeListOf<HTMLElement>;
  interval?:
    | null
    | undefined
    | number
    | ((elementCount: number, timeRunning: number) => number);
}

export interface TagOptions {
  ownedBy?: null | undefined | ReadonlyArray<string>;
}

export interface PageParserTreeOptions {
  logError?:
    | null
    | undefined
    | ((err: Error, el: undefined | HTMLElement) => void);
  tags: { [tag: string]: TagOptions };
  watchers: ReadonlyArray<Watcher>;
  finders: { [tag: string]: Finder };
}

export default class PageParserTree {
  tree: TagTree<HTMLElement>;

  constructor(root: Document | HTMLElement, options: PageParserTreeOptions);
  dump(): void;

  // Intended for use with hot module replacement.
  replaceOptions(options: PageParserTreeOptions): void;
}
