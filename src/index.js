/* @flow */

import LiveSet from 'live-set';
import type {LiveSetController, LiveSetSubscription} from 'live-set';
import liveSetMerge from 'live-set/merge';
import liveSetFlatMap from 'live-set/flatMap';
import liveSetMap from 'live-set/map';
import {TagTree} from 'tag-tree';
import type {TagTreeController, TagTreeNode} from 'tag-tree';

import watcherFinderMerger from './watcherFinderMerger';
import makeLiveSetTransformerFromSelectors from './makeLiveSetTransformerFromSelectors';

export type Selector =
  string
  // The children operator: this will change the matched set to contain only
  // the direct children of the current matched set, and then filters them
  // based on a css selector string.

  | {| $filter: (el: HTMLElement) => boolean |}
  // The $filter operator allows you to specify a function which will be called
  // on every matched element. If the function returns false, then the element
  // will be removed from the matched set.

  | {| $map: (el: HTMLElement) => ?HTMLElement |}
  // The $map operator allows you to specify a function which will be called
  // on every matched element, and each element in the matched set will be
  // replaced with the element returned by your function. If your function
  // returns null, then the element will just be removed from the matched set.

  | {| $watch: {| attributeFilter: string[], cond: string | (el: HTMLElement) => boolean |} |}
  // The $watch operator allows you to specify either an attributeFilter list
  // and a css selector string or function. The currently matched elements
  // will be removed from the matched set if they don't match the css selector
  // string or pass the given function. If the element has any list attributes
  // changed, then it will be re-considered and may be added or removed from
  // the matched set.

  | {| $or: Array<Array<Selector>> |}
  // The $or operator forks the operator list into multiple lists, and then
  // re-combines the resulting matched sets.

  | {| $log: string |}
  // The $log operator uses `console.log` to log every element in the matched
  // set to the console with a given string prefix.
;

export type Watcher = {|
  sources: Array<string|null>;
  tag: string;
  selectors: Array<Selector>;
|};

export type Finder = {|
  fn(root: HTMLElement): Array<HTMLElement> | NodeList<HTMLElement>;
  interval?: ?number;
|};

export type TagOptions = {
  ownedBy?: ?Array<string>;
};

export type PageParserTreeOptions = {|
  logError?: ?(err: Error, el: ?HTMLElement) => void;
  tags: {[tag:string]: TagOptions};
  watchers: Array<Watcher>;
  finders: {[tag:string]: Finder};
|};

type NodeTagPair = {|
  tag: ?string;
  node: TagTreeNode<HTMLElement>;
|};

export type ElementContext = {|
  el: HTMLElement;
  parents: Array<NodeTagPair>;
|};

function makeTagOptions(options: PageParserTreeOptions) {
  const map = new Map();
  const list = [];
  Object.keys(options.tags).forEach(tag => {
    const tagOptions = options.tags[tag];
    const {ownedBy} = tagOptions;
    list.push({tag, ownedBy});
    map.set(tag, tagOptions);
  });
  Object.keys(options.finders)
    .concat(options.watchers.map(w => w.tag))
    .forEach(tag => {
      if (!map.has(tag)) {
        map.set(tag, {});
        list.push({tag});
      }
    });
  return {map, list};
}

export default class PageParserTree {
  tree: TagTree<HTMLElement>;
  _treeController: TagTreeController<HTMLElement>;

  _rootMatchedSet: LiveSet<ElementContext>;
  _ecSources: Map<string, {
    liveSet: LiveSet<LiveSet<ElementContext>>;
    controller: LiveSetController<LiveSet<ElementContext>>;
    ecSet: LiveSet<ElementContext>;
  }>;

  _logError: (err: Error, el: ?HTMLElement) => void;
  _options: PageParserTreeOptions;
  _tagOptions: Map<string, TagOptions>;
  _tagsList: Array<{| tag: string, ownedBy?: ?string[] |}>;
  _subscriptions: Array<LiveSetSubscription> = [];

  constructor(root: Document|HTMLElement, options: PageParserTreeOptions) {
    let rootEl;
    if (root.nodeType === Node.DOCUMENT_NODE) {
      rootEl = ((root:any):Document).documentElement;
      if (!rootEl) throw new Error('missing documentElement');
    } else {
      rootEl = (root:any);
    }

    this._options = options;
    this._logError = options.logError || function(err) {
      setTimeout(() => {
        throw err;
      }, 0);
    };

    const {map: tagOptionsMap, list: tags} = makeTagOptions(this._options);
    this._tagOptions = tagOptionsMap;
    this._tagsList = tags;

    this.tree = new TagTree({
      root: rootEl,
      tags,
      executor: controller => {
        this._treeController = controller;
      }
    });
    this._rootMatchedSet = LiveSet.constant(new Set([{
      el: this.tree.getValue(),
      parents: [{tag: null, node: this.tree}]
    }]));

    this._setupWatchersAndFinders();
  }

  _setupWatchersAndFinders() {
    const tagsWithWatchers = new Set();
    this._options.watchers.forEach(watcher => {
      tagsWithWatchers.add(watcher.tag);
    });

    this._ecSources = new Map(this._tagsList.map(({tag}) => {
      const tagOptions = this._tagOptions.get(tag);
      if (!tagOptions) throw new Error();
      const ownedBy = new Set(tagOptions.ownedBy || []);

      const {liveSet, controller} = LiveSet.active();
      const combinedWatcherSet = tagsWithWatchers.has(tag) ?
        liveSetFlatMap(liveSet, s => s) : null;
      const finder = this._options.finders[tag];
      const ecsToTag = finder ?
        watcherFinderMerger(
          this.tree, tagOptions, combinedWatcherSet, finder, this._logError
        ) : combinedWatcherSet || LiveSet.constant(new Set());

      const elementsToNodes: Map<HTMLElement, TagTreeNode<HTMLElement>> = new Map();

      function findParentNode(taggedParents: NodeTagPair[]): TagTreeNode<HTMLElement> {
        let parentNode;
        for (let i=taggedParents.length-1; i>=0; i--) {
          if (taggedParents[i].tag == null || ownedBy.has(taggedParents[i].tag)) {
            parentNode = taggedParents[i].node;
            break;
          }
        }
        if (!parentNode) throw new Error();
        return parentNode;
      }

      const ecSet = liveSetMap(ecsToTag, ec => {
        const {el, parents} = ec;
        const parentNode = findParentNode(parents);
        const node = this._treeController.addTaggedValue(parentNode, tag, el);
        if (elementsToNodes.has(el)) {
          this._logError(new Error('Watcher received element twice'), el);
        }
        elementsToNodes.set(el, node);

        const newParents = ec.parents.concat([{tag, node}]);
        return {el, parents: newParents};
      });

      this._subscriptions.push(ecSet.subscribe(changes => {
        changes.forEach(change => {
          if (change.type === 'remove') {
            const node = elementsToNodes.get(change.value.el);
            if (!node) throw new Error('Should not happen: received removal of unseen element');
            elementsToNodes.delete(change.value.el);
            const nodeParent = node.getParent();

            // The node might have already been removed from the tree if it
            // is owned by a node that was just removed.
            if (nodeParent && nodeParent.ownsNode(node)) {
              this._treeController.removeTaggedNode(nodeParent, tag, node);
            }
          }
        });
      }));

      return [tag, {liveSet, controller, ecSet}];
    }));

    this._options.watchers.forEach(({sources, selectors, tag}) => {
      const sourceSets = sources.map(tag => {
        if (!tag) return this._rootMatchedSet;
        const entry = this._ecSources.get(tag);
        if (!entry) throw new Error('Unknown source: '+tag);
        return entry.ecSet;
      });
      const sourceSet = sourceSets.length === 1 ? sourceSets[0] : liveSetMerge(sourceSets);
      const transformer = makeLiveSetTransformerFromSelectors(selectors);

      const ecEntry = this._ecSources.get(tag);
      if (!ecEntry) throw new Error();
      ecEntry.controller.add(transformer(sourceSet));
    });

    this._subscriptions.forEach(sub => {
      sub.pullChanges();
    });
  }

  _dumpWithoutEnd() {
    this._subscriptions.forEach(sub => {
      sub.unsubscribe();
    });
    this._subscriptions.length = 0;
    this.tree.getOwned().forEach((liveSet, tag) => {
      liveSet.values().forEach(node => {
        this._treeController.removeTaggedNode(this.tree, tag, node);
      });
    });
  }

  dump() {
    this._dumpWithoutEnd();
    this._treeController.end();
  }

  // Intended for use with hot module replacement.
  replaceOptions(options: PageParserTreeOptions) {
    const tagErrStr = 'replaceOptions does not support tag changes';
    const {map: tagOptionsMap} = makeTagOptions(options);
    if (this._tagOptions.size !== tagOptionsMap.size) {
      throw new Error(tagErrStr);
    }
    this._tagOptions.forEach((oldOptions, tag) => {
      const newOptions = tagOptionsMap.get(tag);
      if (!newOptions) throw new Error(tagErrStr);
      const oldOwnedBy = oldOptions.ownedBy || [];
      const newOwnedBy = new Set(newOptions.ownedBy || []);
      if (oldOwnedBy.length !== newOwnedBy.size) throw new Error(tagErrStr);
      oldOwnedBy.forEach(tag => {
        if (!newOwnedBy.has(tag)) throw new Error(tagErrStr);
      });
    });

    this._dumpWithoutEnd();
    this._options = options;
    this._setupWatchersAndFinders();
  }
}
