/* @flow */

import LiveSet from 'live-set';
import type Scheduler from 'live-set/Scheduler';
import type { TagTree } from 'tag-tree';
import type { TagOptions, Finder } from '.';

import type { ElementContext } from './internalTypes';

export default function watcherFinderMerger(
  scheduler: Scheduler,
  tagTree: TagTree<HTMLElement>,
  tag: string,
  tagOptions: TagOptions,
  watcherSet: ?LiveSet<ElementContext>,
  finder: ?Finder,
  logError: (err: Error, el: void | HTMLElement) => void
): LiveSet<ElementContext> {
  return new LiveSet({
    scheduler,
    read() {
      throw new Error('Should not happen');
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
                const { el } = change.value;
                watcherFoundElements.add(el);
                if (currentElements.has(el)) {
                  logError(
                    new Error(
                      `PageParserTree(${tag}) watcher found element already found by finder`
                    ),
                    el
                  );
                } else {
                  currentElements.add(el);
                  currentElementContexts.add(change.value);
                  controller.add(change.value);
                }
              } else if (change.type === 'remove') {
                const { el } = change.value;
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

      let finderSchedule = null;

      if (finder) {
        const { fn, interval } = finder;
        const ownedBy = tagOptions.ownedBy || [];

        const runFinder = () => {
          const finderRunFoundElements = new Set();
          const found = fn(tagTree.getValue());
          for (let i = 0, len = found.length; i < len; i++) {
            const el = found[i];
            finderRunFoundElements.add(el);
            if (!currentElements.has(el)) {
              currentElements.add(el);
              const ec = makeElementContext(el, tagTree, ownedBy);
              currentElementContexts.add(ec);
              controller.add(ec);
              if (watcherSet) {
                logError(
                  new Error(
                    `PageParserTree(${tag}) finder found element missed by watcher`
                  ),
                  el
                );
                if (sub) sub.pullChanges();
              }
            }
          }

          currentElementContexts.forEach(ec => {
            const { el } = ec;
            if (!finderRunFoundElements.has(el)) {
              if (watcherFoundElements.has(el)) {
                if (!watcherFoundElementsMissedByFinder.has(el)) {
                  watcherFoundElementsMissedByFinder.add(el);
                  logError(
                    new Error(
                      `PageParserTree(${tag}) watcher found element missed by finder`
                    ),
                    el
                  );
                }
              } else {
                currentElementContexts.delete(ec);
                currentElements.delete(el);
                controller.remove(ec);
                if (sub) sub.pullChanges();
              }
            }
          });

          scheduler.flush();
        };

        finderSchedule = scheduleRepeatingFinder(
          interval,
          currentElements,
          runFinder
        );
      }

      return {
        unsubscribe() {
          if (finderSchedule != null) finderSchedule.dispose();
          if (sub) sub.unsubscribe();
        },
        pullChanges() {
          if (sub) sub.pullChanges();
        }
      };
    }
  });
}

function scheduleRepeatingFinder(
  interval: $PropertyType<Finder, 'interval'>,
  currentElements: Set<any>,
  runFinder: () => void
): { dispose(): void } {
  const finderStartedTimestamp = Date.now();

  let timeoutHandle = null;
  let idleHandle = null;

  const step = () => {
    idleHandle = null;
    runFinder();
    scheduleNextStep();
  };

  const scheduleNextStep = () => {
    let time;
    if (interval == null) {
      time = 5000 + Math.random() * 1000;
    } else if (typeof interval === 'number') {
      time = interval;
    } else if (typeof interval === 'function') {
      time = interval(
        currentElements.size,
        Date.now() - finderStartedTimestamp
      );
    } else {
      throw new Error(`interval has wrong type: ${typeof interval}`);
    }

    // Assert to Flow that all paths should have set time to a number.
    (time: number);

    if (time === Infinity) {
      return;
    }

    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      if (global.requestIdleCallback && global.cancelIdleCallback) {
        // Wait up to `time` milliseconds again until there's an idle moment.
        idleHandle = global.requestIdleCallback(step, {
          timeout: time
        });
      } else {
        step();
      }
    }, time);
  };

  scheduleNextStep();

  return {
    dispose() {
      if (timeoutHandle != null) clearTimeout(timeoutHandle);
      if (idleHandle != null) global.cancelIdleCallback(idleHandle);
    }
  };
}

function makeElementContext(
  el: HTMLElement,
  tagTree: TagTree<HTMLElement>,
  ownedBy: $ReadOnlyArray<string>
): ElementContext {
  // Don't compute parents until it's read from.
  // This is important because nodes aren't added to the tag tree until
  // PageParserTree iterates over the results, and some of these nodes may be
  // owned by each other.
  let _cachedParents = null;
  return {
    el,
    get parents() {
      if (!_cachedParents) {
        const root = tagTree.getValue();
        const parents = [];

        let current = el.parentElement;
        while (current) {
          const tagTreeNodes = tagTree.getNodesForValue((current: any));
          for (let i = 0, len = tagTreeNodes.length; i < len; i++) {
            const node = tagTreeNodes[i];
            const tag = node.getTag();
            if (tag == null || ownedBy.indexOf(tag) >= 0) {
              parents.push({ tag, node });
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
