/* @flow */

import LiveSet from 'live-set';

import type { ElementContext } from '../internalTypes';

export default function watchMutations(
  input: LiveSet<ElementContext>,
  attributeFilter: string[],
  condFn: (el: HTMLElement) => boolean
): LiveSet<ElementContext> {
  return new LiveSet({
    scheduler: input.getScheduler(),
    read() {
      throw new Error();
    },
    listen(setValues, controller) {
      setValues(new Set());

      const entries: Map<
        ElementContext,
        { mo: MutationObserver, passed: boolean }
      > = new Map();

      function newEc(ec: ElementContext) {
        const mo = new MutationObserver(changes => {
          if (changes.length === 0) return;
          if (condFn(ec.el)) {
            if (!entry.passed) {
              entry.passed = true;
              controller.add(ec);
            }
          } else {
            if (entry.passed) {
              entry.passed = false;
              controller.remove(ec);
            }
          }
        });

        const entry = { mo, passed: false };
        if (condFn(ec.el)) {
          entry.passed = true;
          controller.add(ec);
        }
        mo.observe(ec.el, { attributes: true, attributeFilter });
        entries.set(ec, entry);
      }

      function removedEc(ec: ElementContext) {
        const entry = entries.get(ec);
        if (!entry)
          throw new Error('Should not happen: Unseen ElementContext removed');
        entry.mo.disconnect();
        if (entry.passed) {
          controller.remove(ec);
        }
        entries.delete(ec);
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
          entries.forEach(({ mo }) => {
            mo.disconnect();
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
