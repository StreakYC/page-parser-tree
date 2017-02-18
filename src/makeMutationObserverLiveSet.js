/* @flow */

import LiveSet from 'live-set';
import matchesSelector from 'matches-selector-ng';

import type {ElementContext} from '.';

export default function makeMutationObserverLiveSet(
  ec: ElementContext,
  attributeFilter: string[],
  cond: string | (el: HTMLElement) => boolean
): LiveSet<ElementContext> {
  const {el: element} = ec;
  const _cond = cond;
  const checkElement = typeof _cond === 'string' ?
    () => matchesSelector(element, _cond) :
    () => _cond(element);

  return new LiveSet({
    read() {
      const s = new Set();
      if (checkElement()) {
        s.add(ec);
      }
      return s;
    },
    listen(setValues, controller) {
      let isInSet = false;
      const initialValues = new Set();
      if (checkElement()) {
        isInSet = true;
        initialValues.add(ec);
      }
      setValues(initialValues);

      function changesHandler(mutations) {
        if (mutations.length === 0) return;
        if (checkElement()) {
          if (!isInSet) {
            isInSet = true;
            controller.add(ec);
          }
        } else {
          if (isInSet) {
            isInSet = false;
            controller.remove(ec);
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
