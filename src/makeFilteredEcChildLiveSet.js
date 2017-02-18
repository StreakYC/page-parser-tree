/* @flow */

import LiveSet from 'live-set';
import matchesSelector from 'matches-selector-ng';

import type {ElementContext} from '.';

export default function makeFilteredEcChildLiveSet(ec: ElementContext, selector: string): LiveSet<ElementContext> {
  return new LiveSet({
    read() {
      const {el, parents} = ec;
      const {children} = el;
      const s = new Set();
      for (let i=0,len=children.length; i<len; i++) {
        const child = children[i];
        if (matchesSelector(child, selector)) {
          s.add({el: child, parents});
        }
      }
      return s;
    },
    listen(setValues, controller) {
      const ecs: Map<HTMLElement, ElementContext> = new Map();
      const {el: element, parents} = ec;

      {
        const {children} = element;
        const s = new Set();
        for (let i=0,len=children.length; i<len; i++) {
          const child = children[i];
          if (matchesSelector(child, selector)) {
            const ec = {el: child, parents};
            ecs.set(child, ec);
            s.add(ec);
          }
        }
        setValues(s);
      }

      function addedNode(child) {
        if (child.nodeType !== 1) return;
        if (matchesSelector(child, selector)) {
          const ec = {el: child, parents};
          ecs.set(child, ec);
          controller.add(ec);
        }
      }

      function removedNode(child) {
        if (child.nodeType !== 1) return;
        const ec = ecs.get(child);
        if (!ec) return;
        ecs.delete(child);
        controller.remove(ec);
      }

      function changesHandler(mutations) {
        mutations.forEach(mutation => {
          Array.prototype.forEach.call(mutation.addedNodes, addedNode);
          Array.prototype.forEach.call(mutation.removedNodes, removedNode);
        });
      }
      const observer = new MutationObserver(changesHandler);
      observer.observe(element, {childList: true});

      return {
        unsubscribe() {
          observer.disconnect();
        },
        pullChanges() {
          changesHandler(observer.takeRecords());
        }
      };
    }
  });
}
