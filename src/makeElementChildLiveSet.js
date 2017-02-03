/* @flow */

import LiveSet from 'live-set';

export default function makeElementChildLiveSet(element: HTMLElement): LiveSet<HTMLElement> {
  return new LiveSet({
    read() {
      return new Set(Array.from(element.children));
    },
    listen(controller) {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          Array.prototype.forEach.call(mutation.addedNodes, el => controller.add(el));
          Array.prototype.forEach.call(mutation.removedNodes, el => controller.remove(el));
        });
      });
      observer.observe(element, {childList: true});
      return () => {
        observer.disconnect();
      };
    }
  });
}
