/* @flow */

import LiveSet from 'live-set';

import type { ElementContext } from '../internalTypes';

export default function watchFilteredChildren(
  input: LiveSet<ElementContext>,
  condFn: (el: HTMLElement) => boolean
): LiveSet<ElementContext> {
  return new LiveSet({
    scheduler: input.getScheduler(),
    read() {
      throw new Error();
    },
    listen(setValues, controller) {
      setValues(new Set());

      const inputEntries: Map<
        ElementContext,
        { observer: MutationObserver, removedNode: * }
      > = new Map();
      const outputEcs: Map<HTMLElement, ElementContext> = new Map();

      function newEc(ec: ElementContext) {
        function addedNode(child: Node) {
          if (child.nodeType !== 1) return;
          /*:: if (!(child instanceof HTMLElement)) throw new Error() */
          if (condFn(child)) {
            const childEc = { el: child, parents: ec.parents };
            outputEcs.set(child, childEc);
            controller.add(childEc);
          }
        }

        function removedNode(child: Node) {
          if (child.nodeType !== 1) return;
          /*:: if (!(child instanceof HTMLElement)) throw new Error() */
          const childEc = outputEcs.get(child);
          if (!childEc) return;
          outputEcs.delete(child);
          controller.remove(childEc);
        }

        function changesHandler(mutations) {
          if (mutations.length > 1) {
            // If any removals are followed by a re-add, then drop the pair.
            const removedEls = new Set();
            const addedEls = [];
            mutations.forEach(({ addedNodes, removedNodes }) => {
              for (let i = 0, len = removedNodes.length; i < len; i++) {
                const el = removedNodes[i];
                if (el.nodeType !== 1) continue;
                removedEls.add(removedNodes[i]);
              }
              for (let i = 0, len = addedNodes.length; i < len; i++) {
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

        Array.prototype.forEach.call(ec.el.children, addedNode);

        const observer = new MutationObserver(changesHandler);
        observer.observe(ec.el, { childList: true });

        inputEntries.set(ec, { observer, removedNode });
      }

      function removedEc(ec: ElementContext) {
        const entry = inputEntries.get(ec);
        if (!entry)
          throw new Error('Should not happen: Unseen ElementContext removed');
        entry.observer.takeRecords().forEach(mutation => {
          Array.prototype.forEach.call(
            mutation.removedNodes,
            entry.removedNode
          );
        });
        entry.observer.disconnect();
        Array.prototype.forEach.call(ec.el.children, entry.removedNode);
        inputEntries.delete(ec);
      }

      const sub = input.subscribe({
        start() {
          input.values().forEach(newEc);
        },
        next(changes) {
          changes.forEach(change => {
            if (change.type === 'add') {
              newEc(change.value);
            } else if (change.type === 'remove') {
              removedEc(change.value);
            }
          });
        }
      });

      return {
        unsubscribe() {
          sub.unsubscribe();
          inputEntries.forEach(({ observer }) => {
            observer.disconnect();
          });
        },
        pullChanges() {
          sub.pullChanges();
          // Don't bother doing observer.takeRecords(), we don't need that in
          // PageParserTree for how we use pullChanges().
        }
      };
    }
  });
}
