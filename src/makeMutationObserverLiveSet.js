/* @flow */

import LiveSet from 'live-set';
import matchesSelector from 'matches-selector-ng';

export default function makeMutationObserverLiveSet(
  element: HTMLElement,
  attributeFilter: string[],
  cond: string | (el: HTMLElement) => boolean
): LiveSet<HTMLElement> {
  const _cond = cond;
  const checkElement = typeof _cond === 'string' ?
    () => matchesSelector(element, _cond) :
    () => _cond(element);

  return new LiveSet({
    read() {
      const s = new Set();
      if (checkElement()) {
        s.add(element);
      }
      return s;
    },
    listen(setValues, controller) {
      let isInSet = false;
      const initialValues = new Set();
      if (checkElement()) {
        isInSet = true;
        initialValues.add(element);
      }
      setValues(initialValues);

      function changesHandler(mutations) {
        if (mutations.length === 0) return;
        if (checkElement()) {
          if (!isInSet) {
            isInSet = true;
            controller.add(element);
          }
        } else {
          if (isInSet) {
            isInSet = false;
            controller.remove(element);
          }
        }
      }
      const observer = new MutationObserver(changesHandler);
      observer.observe(element, {attributes: true, attributeFilter});

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
