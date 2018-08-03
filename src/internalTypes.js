/* @flow */

import type { TagTreeNode } from 'tag-tree';

export type NodeTagPair = {|
  tag: ?string,
  node: TagTreeNode<HTMLElement>
|};

export type ElementContext = {|
  el: HTMLElement,
  parents: Array<NodeTagPair>
|};
