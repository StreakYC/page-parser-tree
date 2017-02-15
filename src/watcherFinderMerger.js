/* @flow */

import LiveSet from 'live-set';
import type {TagTree} from 'tag-tree';
import type {TagOptions, ElementContext, Finder} from '.';

export default function watcherFinderMerger(tagTree: TagTree<HTMLElement>, tagOptions: TagOptions, watcherSet: ?LiveSet<ElementContext>, finder: ?Finder, logError: (err: Error, el: ?HTMLElement) => void): LiveSet<ElementContext> {
  let read_elementsLoggedAbout;
  return new LiveSet({
    read() {
      if (!read_elementsLoggedAbout) {
        read_elementsLoggedAbout = {
          missedByWatcher: new WeakSet(),
          missedByFinder: new WeakSet()
        };
      }

      const watcherFoundElements = new Set();
      let s;
      if (watcherSet) {
        s = watcherSet.values();
        s.forEach(ec => {
          watcherFoundElements.add(ec.el);
        });
      } else {
        s = new Set();
      }
      if (finder) {
        const ownedBy = tagOptions.ownedBy || [];
        const finderRunFoundElements = new Set();
        const found = finder.fn(tagTree.getValue());
        for (let i=0,len=found.length; i<len; i++) {
          const el = found[i];
          finderRunFoundElements.add(el);
          if (!watcherFoundElements.has(el)) {
            const ec = makeElementContext(el, tagTree, ownedBy);
            s.add(ec);
            if (watcherSet && !read_elementsLoggedAbout.missedByWatcher.has(el)) {
              read_elementsLoggedAbout.missedByWatcher.add(el);
              logError(new Error('finder found element missed by watcher'), el);
            }
          }
        }

        watcherFoundElements.forEach(el => {
          if (!finderRunFoundElements.has(el) && !read_elementsLoggedAbout.missedByFinder.has(el)) {
            read_elementsLoggedAbout.missedByFinder.add(el);
            logError(new Error('watcher found element missed by finder'), el);
          }
        });
      }
      return s;
    },
    listen(setValues, controller) {
      const currentElements = new Set();
      const currentElementContexts = new Set();
      const watcherFoundElements = new Set();
      const watcherFoundElementsMissedByFinder = new Set();

      let sub = null;
      if (watcherSet) {
        sub = watcherSet.subscribe({
          start() {
            if (!watcherSet) throw new Error();
            const currentValues = watcherSet.values();
            setValues(currentValues);
            currentValues.forEach(ec => {
              watcherFoundElements.add(ec.el);
              currentElements.add(ec.el);
              currentElementContexts.add(ec);
            });
          },
          next(changes) {
            changes.forEach(change => {
              if (change.type === 'add') {
                const {el} = change.value;
                watcherFoundElements.add(el);
                if (currentElements.has(el)) {
                  logError(new Error('watcher found element already found by finder'), el);
                } else {
                  currentElements.add(el);
                  currentElementContexts.add(change.value);
                  controller.add(change.value);
                }
              } else if (change.type === 'remove') {
                const {el} = change.value;
                watcherFoundElements.delete(el);
                watcherFoundElementsMissedByFinder.delete(el);
                if (currentElementContexts.has(change.value)) {
                  currentElements.delete(el);
                  currentElementContexts.delete(change.value);
                  controller.remove(change.value);
                } // else the ec was added by finder and it will deal with this
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
      } else {
        setValues(new Set());
      }

      let interval;
      if (finder) {
        const _finder = finder;
        const ownedBy = tagOptions.ownedBy || [];
        interval = setInterval(() => {
          const finderRunFoundElements = new Set();
          const found = _finder.fn(tagTree.getValue());
          for (let i=0, len=found.length; i<len; i++) {
            const el = found[i];
            finderRunFoundElements.add(el);
            if (!currentElements.has(el)) {
              currentElements.add(el);
              const ec = makeElementContext(el, tagTree, ownedBy);
              currentElementContexts.add(ec);
              controller.add(ec);
              if (watcherSet) {
                logError(new Error('finder found element missed by watcher'), el);
                if (sub) sub.pullChanges();
              }
            }
          }

          currentElementContexts.forEach(ec => {
            const {el} = ec;
            if (!finderRunFoundElements.has(el)) {
              if (watcherFoundElements.has(el)) {
                if (!watcherFoundElementsMissedByFinder.has(el)) {
                  watcherFoundElementsMissedByFinder.add(el);
                  logError(new Error('watcher found element missed by finder'), el);
                }
              } else {
                currentElementContexts.delete(ec);
                currentElements.delete(el);
                controller.remove(ec);
                if (sub) sub.pullChanges();
              }
            }
          });
        }, finder.interval || (5000+Math.random()*5000));
      }

      return {
        unsubscribe() {
          clearInterval(interval);
          if (sub) sub.unsubscribe();
        },
        pullChanges() {
          if (sub) sub.pullChanges();
        }
      };
    }
  });
}

function makeElementContext(el: HTMLElement, tagTree: TagTree<HTMLElement>, ownedBy: string[]): ElementContext {
  // Don't compute parents until it's read from.
  // This is important because nodes aren't added to the tag tree until
  // PageParserTree iterates over the results, and some of these nodes may be
  // owned by each other.
  let _cachedParents = null;
  return {
    el,
    // Hide the getter from Flow because it doesn't support getters yet.
    /*:: parents: [] || ` */ get parents() /*:: `||function() */ {
      if (!_cachedParents) {
        const root = tagTree.getValue();
        const parents = [];

        let current = el.parentElement;
        while (current) {
          const tagTreeNodes = tagTree.getNodesForValue((current:any));
          for (let i=0,len=tagTreeNodes.length; i<len; i++) {
            const node = tagTreeNodes[i];
            const tag = node.getTag();
            if (tag == null || ownedBy.indexOf(tag) >= 0) {
              parents.push({tag, node});
              break;
            }
          }

          if (current === root) break;
          current = current.parentElement;
        }

        parents.reverse();

        _cachedParents = parents;
      }
      return _cachedParents;
    }
  };
}
