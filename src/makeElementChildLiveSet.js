/* @flow */

import LiveSet from 'live-set';

export default function makeElementChildLiveSet(element: HTMLElement): LiveSet<HTMLElement> {
  return new LiveSet({
    read() {
      return new Set(Array.from(element.children));
    },
    listen(setValues, controller) {
      setValues(this.read());

      function changesHandler(mutations) {
        mutations.forEach(mutation => {
          Array.prototype.forEach.call(mutation.addedNodes, el => controller.add(el));
          Array.prototype.forEach.call(mutation.removedNodes, el => controller.remove(el));
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
