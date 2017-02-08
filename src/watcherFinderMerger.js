/* @flow */

import LiveSet from 'live-set';
import type {TagTree} from 'tag-tree';
import type {TagOptions, ElementContext, Finder} from '.';

export default function watcherFinderMerger(tagTree: TagTree<HTMLElement>, tagOptions: TagOptions, watcherSet: ?LiveSet<ElementContext>, finder: ?Finder, logError: (err: Error, el: ?HTMLElement) => void): LiveSet<ElementContext> {
  return new LiveSet({
    read() {
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

            if (watcherSet) {
              logError(new Error('finder found element missed by watcher'), el);
            }
          }
        }

        if (watcherSetValues) {
          watcherSetValues.forEach(({el}) => {
            if (!foundElements.has(el)) {
              logError(new Error('watcher found element missed by finder'), el);
            }
          });
        }
      }
      return s;
    },
    listen(setValues, controller) { //eslint-disable-line
      throw new Error('TODO');
    }
  });
}
