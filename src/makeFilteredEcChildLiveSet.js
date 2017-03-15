/* @flow */

import LiveSet from 'live-set';
import type Scheduler from 'live-set/Scheduler';
import matchesSelector from 'matches-selector-ng';

import type {ElementContext} from '.';

export default function makeFilteredEcChildLiveSet(scheduler: Scheduler, ec: ElementContext, selector: string): LiveSet<ElementContext> {
  return new LiveSet({
    scheduler,
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

      function addedNode(child: Node) {
        if (child.nodeType !== 1) return;
        /*:: if (!(child instanceof HTMLElement)) throw new Error() */
        if (matchesSelector(child, selector)) {
          const ec = {el: child, parents};
          ecs.set(child, ec);
          controller.add(ec);
        }
      }

      function removedNode(child: Node) {
        if (child.nodeType !== 1) return;
        /*:: if (!(child instanceof HTMLElement)) throw new Error() */
        const ec = ecs.get(child);
        if (!ec) return;
        ecs.delete(child);
        controller.remove(ec);
      }

      function changesHandler(mutations) {
        if (mutations.length > 1) {
          // If any removals are followed by a re-add, then drop the pair.
          const removedEls = new Set();
          const addedEls = [];
          mutations.forEach(({addedNodes, removedNodes}) => {
            for (let i=0,len=removedNodes.length; i<len; i++) {
              const el = removedNodes[i];
              if (el.nodeType !== 1) continue;
              removedEls.add(removedNodes[i]);
            }
            for (let i=0,len=addedNodes.length; i<len; i++) {
              const el = addedNodes[i];
              if (el.nodeType !== 1) continue;
              if (removedEls.has(el)) {
                removedEls.delete(el);
              } else {
                addedEls.push(el);
              }
            }
          });
          addedEls.forEach(addedNode);
          removedEls.forEach(removedNode);
        } else {
          mutations.forEach(mutation => {
            Array.prototype.forEach.call(mutation.addedNodes, addedNode);
            Array.prototype.forEach.call(mutation.removedNodes, removedNode);
          });
        }
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
