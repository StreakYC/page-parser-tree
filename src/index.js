/* @flow */

import t from 'transducers.js';
import LiveSet from 'live-set';
import type {LiveSetSubscription} from 'live-set';
import liveSetTransduce from 'live-set/transduce';
import liveSetMerge from 'live-set/merge';
import liveSetFilter from 'live-set/filter';
import liveSetFlatMap from 'live-set/flatMap';
import liveSetMap from 'live-set/map';
import {TagTree} from 'tag-tree';
import type {TagTreeController, TagTreeNode} from 'tag-tree';
import matchesSelector from 'matches-selector-ng';

import makeElementChildLiveSet from './makeElementChildLiveSet';

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

  | {| $tag: string |}
  // The $tag operator tags all elements currently in the matched set as the
  // given tag.
;

export type Watcher = {|
  sources: Array<string|null>;
  selectors: Array<Selector>;
|};

export type Finder = {|
  fn(root: HTMLElement): Array<HTMLElement> | NodeList<HTMLElement>;
|};

export type TagOptions = {
  ownedBy?: ?Array<string>;
};

export type PageParserTreeOptions = {|
  tags: {[tag:string]: TagOptions};
  watchers: Array<Watcher>;
  finders: {[tag:string]: Finder};
|};

type NodeTagPair = {|
  tag: ?string;
  node: TagTreeNode<HTMLElement>;
|};

type ElementContext = {|
  el: HTMLElement;
  parents: Array<NodeTagPair>;
|};

function makeLiveSetTransformer(selectors: Array<Selector>): LiveSetTransformer {
  const transformers = selectors.map(item => {
    if (typeof item === 'string') {
      const itemString = item;
      const filterXf = t.filter(el => matchesSelector(el, itemString));
      const flatMapFn = ec => {
        const transducer = t.compose(
          filterXf,
          t.map(el => ({el, parents: ec.parents}))
        );
        return liveSetTransduce(makeElementChildLiveSet(ec.el), transducer);
      };
      return (liveSet) => liveSetFlatMap(liveSet, flatMapFn);
    } else if (item.$tag) {
      const {$tag} = item;
      return (liveSet, addSubscription, addTaggedLiveSet) => {
        return addTaggedLiveSet($tag, liveSet);
      };
    } else if (item.$or) {
      const transformers = item.$or.map(makeLiveSetTransformer);
      return (liveSet, addSubscription, addTaggedLiveSet) =>
        liveSetMerge(transformers.map(transformer =>
          transformer(liveSet, addSubscription, addTaggedLiveSet)
        ));
    } else if (item.$watch) {
      throw new Error('TODO');
    } else if (item.$log) {
      const {$log} = item;
      const perItem = (ec) => {
        console.log($log, ec.el); //eslint-disable-line no-console
      };
      return (liveSet, addSubscription) => {
        addSubscription(liveSet.subscribe(changes => {
          changes.forEach(change => {
            if (change.type === 'add') {
              perItem(change.value);
            }
          });
        }));
        liveSet.values().forEach(perItem);
        return liveSet;
      };
    } else if (item.$filter) {
      const {$filter} = item;
      const filterFn = ({el}) => $filter(el);
      return liveSet => liveSetFilter(liveSet, filterFn);
    } else if (item.$map) {
      const {$map} = item;
      const transducer = t.compose(
        t.map(ec => ({el: $map(ec.el), parents: ec.parents})),
        t.filter(ec => ec.el != null)
      );
      return liveSet => liveSetTransduce(liveSet, transducer);
    }
    throw new Error(`Invalid selector item: ${JSON.stringify(item)}`);
  });

  return transformers.reduce((combined, transformer) => {
    return (liveSet, addSubscription, addTaggedLiveSet) => {
      return transformer(
        combined(liveSet, addSubscription, addTaggedLiveSet),
        addSubscription,
        addTaggedLiveSet
      );
    };
  });
}

type LiveSetTransformer = (
  liveSet: LiveSet<ElementContext>,
  addSubscription: (sub: LiveSetSubscription) => void,
  addTaggedLiveSet: (tag: string, taggedLiveSet: LiveSet<ElementContext>) => LiveSet<ElementContext>
) => LiveSet<ElementContext>;

export default class PageParserTree {
  tree: TagTree<HTMLElement>;
  _treeController: TagTreeController<HTMLElement>;
  _options: PageParserTreeOptions;
  _tagOptions: Map<string, TagOptions>;
  _watcherLiveSetTransformers: Map<Array<Selector>, LiveSetTransformer>;
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

    this._tagOptions = new Map();
    const tags = [];
    Object.keys(this._options.tags).forEach(tag => {
      const tagOptions = this._options.tags[tag];
      const {ownedBy} = tagOptions;
      tags.push({tag, ownedBy});
      this._tagOptions.set(tag, tagOptions);
    });
    this._options.watchers.forEach(watcher => {
      watcher.selectors.forEach(item => {
        if (typeof item === 'object' && item.$tag) {
          const {$tag} = item;
          if (!this._tagOptions.has($tag)) {
            this._tagOptions.set($tag, {});
            tags.push({tag: $tag});
          }
        }
      });
    });

    this.tree = new TagTree({
      root: rootEl,
      tags,
      executor: controller => {
        this._treeController = controller;
      }
    });
    this._watcherLiveSetTransformers = new Map(
      this._options.watchers.map(({selectors}) =>
        [selectors, makeLiveSetTransformer(selectors)]
      )
    );
    const rootMatchedSet = LiveSet.active(new Set([{
      el: this.tree.getValue(),
      parents: [{tag: null, node: this.tree}]
    }])).liveSet;
    this._processSourceLiveSet(null, rootMatchedSet);
  }

  _processSourceLiveSet(tag: null|string, liveSet: LiveSet<ElementContext>) {
    const addSubscription = (sub: LiveSetSubscription) => {
      this._subscriptions.push(sub);
    };

    const addTaggedLiveSet = (tag, taggedLiveSet) => {
      const findParent = parents => {
        const entry = this._tagOptions.get(tag);
        if (!entry) throw new Error('unknown tag: '+tag);
        const {ownedBy} = entry;
        let parent = parents[0].node;
        if (ownedBy) {
          for (let i=parents.length-1; i>=1; i--) {
            if ((ownedBy:any).indexOf(parents[i].tag) >= 0) {
              parent = parents[i].node;
              break;
            }
          }
        }
        return parent;
      };

      const addItem = ec => {
        const parent = findParent(ec.parents);
        const node = this._treeController.addTaggedValue(parent, tag, ec.el);
        const newParents = ec.parents.concat([
          {tag, node}
        ]);
        const newEc = {el: ec.el, parents: newParents};
        return newEc;
      };

      const mappedTls = liveSetMap(taggedLiveSet, addItem);

      let sub;
      let gotFirstItem = false;

      mappedTls.subscribe({
        start: _sub => {
          sub = _sub;
          this._subscriptions.push(sub);
        },
        next: changes => {
          if (!gotFirstItem) {
            gotFirstItem = true;
            this._processSourceLiveSet(tag, mappedTls);
          }

          changes.forEach(change => {
            if (change.type === 'remove') {
              const ec = change.value;
              const node = ec.parents[ec.parents.length-1].node;

              // The node might have already been removed from the tree if it
              // is owned by a node that was just removed.
              const nodeParent = node.getParent();
              if (nodeParent && nodeParent.ownsNode(node)) {
                const parent = findParent(ec.parents.slice(0, -1));
                this._treeController.removeTaggedNode(parent, tag, node);
              }
            }
          });
        },
        complete: () => {
          const ix = this._subscriptions.indexOf(sub);
          if (ix < 0) throw new Error();
          this._subscriptions.splice(ix, 1);
        }
      });

      if (!gotFirstItem && Array.from(mappedTls.values()).length) {
        gotFirstItem = true;
        this._processSourceLiveSet(tag, mappedTls);
      }

      return mappedTls;
    };

    this._options.watchers
      .filter(({sources}) => sources.indexOf(tag) >= 0)
      .forEach(({selectors}) => {
        const transformer = this._watcherLiveSetTransformers.get(selectors);
        if (!transformer) throw new Error();
        transformer(liveSet, addSubscription, addTaggedLiveSet);
      });
  }

  //TODO
  // Intended for use with hot module replacement.
  // replaceOptions(options: Array<PageParserTreeOptions>) {
  // }
}
