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

      const seenElements = new Set();
      let s, watcherSetValues;
      if (watcherSet) {
        watcherSetValues = watcherSet.values();
        s = watcherSetValues;
        watcherSetValues.forEach(ec => {
          seenElements.add(ec.el);
        });
      } else {
        s = new Set();
      }
      if (finder) {
        const root = tagTree.getValue();
        const ownedBy = tagOptions.ownedBy || [];

        const foundElements = new Set();
        const found = finder.fn(root);
        for (let i=0,len=found.length; i<len; i++) {
          const el = found[i];
          foundElements.add(el);
          if (!seenElements.has(el)) {
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
            const ec = {el, parents};
            s.add(ec);

            if (watcherSet && !read_elementsLoggedAbout.missedByWatcher.has(el)) {
              read_elementsLoggedAbout.missedByWatcher.add(el);
              logError(new Error('finder found element missed by watcher'), el);
            }
          }
        }

        if (watcherSetValues) {
          watcherSetValues.forEach(({el}) => {
            if (!foundElements.has(el) && !read_elementsLoggedAbout.missedByFinder.has(el)) {
              read_elementsLoggedAbout.missedByFinder.add(el);
              logError(new Error('watcher found element missed by finder'), el);
            }
          });
        }
      }
      return s;
    },
    listen(setValues, controller) {
      if (!watcherSet) throw new Error('TODO support finder only');
      const sub = watcherSet.subscribe({
        start() {
          if (!watcherSet) throw new Error();
          setValues(watcherSet.values());
        },
        next(changes) {
          changes.forEach(change => {
            if (change.type === 'add') {
              controller.add(change.value);
            } else if (change.type === 'remove') {
              controller.remove(change.value);
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
      return sub;
    }
  });
}
