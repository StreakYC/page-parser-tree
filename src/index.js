/* @flow */

import LiveSet from 'live-set';
import type { LiveSetController, LiveSetSubscription } from 'live-set';
import liveSetMerge from 'live-set/merge';
import liveSetFlatMapR from 'live-set/flatMapR';
import Scheduler from 'live-set/Scheduler';
import { TagTree } from 'tag-tree';
import type { TagTreeController, TagTreeNode } from 'tag-tree';

import type { NodeTagPair, ElementContext } from './internalTypes';

import watcherFinderMerger from './watcherFinderMerger';
import createTransformer from './createTransformer';

export type Selector =
  | string
  | {| $filter: (el: HTMLElement) => boolean |}
  | {| $map: (el: HTMLElement) => ?HTMLElement |}
  | {|
      $watch: {|
        attributeFilter: string[],
        cond: string | ((el: HTMLElement) => boolean)
      |}
    |}
  | {| $or: Array<Array<Selector>> |}
  | {| $log: string |};

export type Watcher = {|
  sources: Array<string | null>,
  tag: string,
  selectors: Array<Selector>
|};

export type Finder = {|
  fn(root: HTMLElement): Array<HTMLElement> | NodeList<HTMLElement>,
  interval?: ?number | ((elementCount: number, timeRunning: number) => number)
|};

export type TagOptions = {|
  ownedBy?: ?$ReadOnlyArray<string>
|};

export type PageParserTreeOptions = {|
  logError?: ?(err: Error, el: void | HTMLElement) => void,
  tags: { [tag: string]: TagOptions },
  watchers: $ReadOnlyArray<Watcher>,
  finders: { [tag: string]: Finder }
|};

function makeTagOptions(options: PageParserTreeOptions) {
  const map = new Map();
  const list = [];
  Object.keys(options.tags).forEach(tag => {
    const tagOptions = options.tags[tag];
    const { ownedBy } = tagOptions;
    list.push({ tag, ownedBy });
    map.set(tag, tagOptions);
  });
  Object.keys(options.finders)
    .concat(options.watchers.map(w => w.tag))
    .forEach(tag => {
      if (!map.has(tag)) {
        map.set(tag, { ownedBy: [] });
        list.push({ tag });
      }
    });
  return { map, list };
}

export default class PageParserTree {
  tree: TagTree<HTMLElement>;
  _scheduler = new Scheduler();
  _treeController: TagTreeController<HTMLElement>;

  _rootMatchedSet: LiveSet<ElementContext>;
  _ecSources: Map<
    string,
    {
      liveSet: LiveSet<LiveSet<ElementContext>>,
      controller: LiveSetController<LiveSet<ElementContext>>,
      ecSet: LiveSet<ElementContext>
    }
  >;

  _logError: (err: Error, el: void | HTMLElement) => void;
  _options: PageParserTreeOptions;
  _tagOptions: Map<string, TagOptions>;
  _tagsList: Array<{| tag: string, ownedBy?: ?$ReadOnlyArray<string> |}>;
  _subscriptions: Array<LiveSetSubscription> = [];

  constructor(root: Document | HTMLElement, options: PageParserTreeOptions) {
    let rootEl;
    if (root.nodeType === Node.DOCUMENT_NODE) {
      rootEl = ((root: any): Document).documentElement;
      if (!rootEl) throw new Error('missing documentElement');
    } else {
      rootEl = (root: any);
    }

    this._options = options;
    this._logError =
      options.logError ||
      function(err) {
        setTimeout(() => {
          throw err;
        }, 0);
      };

    const { map: tagOptionsMap, list: tags } = makeTagOptions(this._options);
    this._tagOptions = tagOptionsMap;
    this._tagsList = tags;

    this.tree = new TagTree({
      root: rootEl,
      tags,
      executor: controller => {
        this._treeController = controller;
      }
    });
    this._rootMatchedSet = LiveSet.constant(
      new Set([
        {
          el: this.tree.getValue(),
          parents: [{ tag: null, node: this.tree }]
        }
      ]),
      { scheduler: this._scheduler }
    );

    this._setupWatchersAndFinders();
  }

  _setupWatchersAndFinders() {
    const tagsWithWatchers = new Set();
    this._options.watchers.forEach(watcher => {
      tagsWithWatchers.add(watcher.tag);
    });

    this._ecSources = new Map(
      this._tagsList.map(({ tag }) => {
        const tagOptions = this._tagOptions.get(tag);
        if (!tagOptions) throw new Error();
        const ownedBy = new Set(tagOptions.ownedBy || []);

        const { liveSet, controller } = LiveSet.active(null, {
          scheduler: this._scheduler
        });
        const combinedWatcherSet = tagsWithWatchers.has(tag)
          ? liveSetFlatMapR(liveSet, s => s)
          : null;
        const finder = this._options.finders[tag];
        const ecsToTag = finder
          ? watcherFinderMerger(
              this._scheduler,
              this.tree,
              tag,
              tagOptions,
              combinedWatcherSet,
              finder,
              this._logError
            )
          : combinedWatcherSet ||
            LiveSet.constant(new Set(), { scheduler: this._scheduler });

        const elementsToNodes: Map<
          HTMLElement,
          TagTreeNode<HTMLElement>
        > = new Map();

        function findParentNode(
          taggedParents: NodeTagPair[]
        ): TagTreeNode<HTMLElement> {
          let parentNode;
          for (let i = taggedParents.length - 1; i >= 0; i--) {
            if (
              taggedParents[i].tag == null ||
              ownedBy.has(taggedParents[i].tag)
            ) {
              parentNode = taggedParents[i].node;
              break;
            }
          }
          if (!parentNode) throw new Error();
          return parentNode;
        }

        const ecSet = new LiveSet({
          scheduler: this._scheduler,
          read() {
            throw new Error();
          },
          listen: (setValues, controller) => {
            const m: Map<ElementContext, ElementContext> = new Map();

            const cb = (ec: ElementContext): ElementContext => {
              const { el, parents } = ec;
              const parentNode = findParentNode(parents);
              const node = this._treeController.addTaggedValue(
                parentNode,
                tag,
                el
              );
              if (elementsToNodes.has(el)) {
                this._logError(
                  new Error(
                    `PageParserTree(${tag}) watcher received element twice`
                  ),
                  el
                );
              }
              elementsToNodes.set(el, node);

              const newParents = ec.parents.concat([{ tag, node }]);
              return { el, parents: newParents };
            };

            return ecsToTag.subscribe({
              start: () => {
                const s = new Set();
                ecsToTag.values().forEach(value => {
                  const newValue = cb(value);
                  m.set(value, newValue);
                  s.add(newValue);
                });
                setValues(s);
              },
              next: changes => {
                const ecsRemovedInNotification = new Set();
                if (changes.length > 1) {
                  changes.forEach(change => {
                    if (change.type === 'remove') {
                      ecsRemovedInNotification.add(change.value);
                    }
                  });
                }

                changes.forEach(change => {
                  if (change.type === 'add') {
                    // Don't process adds of elements that are removed by a later
                    // change in this notification.
                    if (ecsRemovedInNotification.has(change.value)) return;
                    const newValue = cb(change.value);
                    m.set(change.value, newValue);
                    controller.add(newValue);
                  } else if (change.type === 'remove') {
                    const newValue = m.get(change.value);
                    if (!newValue) return;
                    m.delete(change.value);
                    controller.remove(newValue);

                    const node = elementsToNodes.get(newValue.el);
                    if (!node)
                      throw new Error(
                        'Should not happen: received removal of unseen element'
                      );
                    elementsToNodes.delete(newValue.el);
                    const nodeParent = node.getParent();

                    // The node might have already been removed from the tree if it
                    // is owned by a node that was just removed.
                    if (nodeParent && nodeParent.ownsNode(node)) {
                      this._treeController.removeTaggedNode(
                        nodeParent,
                        tag,
                        node
                      );
                    }
                  }
                });
              },
              error(err) {
                controller.error(err);
              },
              complete() {
                controller.end();
              }
            });
          }
        });

        this._subscriptions.push(ecSet.subscribe({}));

        return [tag, { liveSet, controller, ecSet }];
      })
    );

    this._options.watchers.forEach(({ sources, selectors, tag }) => {
      const sourceSets = sources.map(tag => {
        if (!tag) return this._rootMatchedSet;
        const entry = this._ecSources.get(tag);
        if (!entry) throw new Error('Unknown source: ' + tag);
        return entry.ecSet;
      });
      const sourceSet =
        sourceSets.length === 1 ? sourceSets[0] : liveSetMerge(sourceSets);
      const transformer = createTransformer(this._scheduler, selectors);

      const ecEntry = this._ecSources.get(tag);
      if (!ecEntry) throw new Error();
      ecEntry.controller.add(transformer(sourceSet));
    });

    this._scheduler.flush();
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
    const { map: tagOptionsMap } = makeTagOptions(options);
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
