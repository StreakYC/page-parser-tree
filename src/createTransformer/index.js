/* @flow */

import t from 'transducers.js';
import type Scheduler from 'live-set/Scheduler';
import liveSetTransduce from 'live-set/transduce';
import liveSetFilter from 'live-set/filter';
import liveSetMerge from 'live-set/merge';
import liveSetFlatMap from 'live-set/flatMap';
import createFilteredEcChildLiveSet from './createFilteredEcChildLiveSet';
import createMutationObserverLiveSet from './createMutationObserverLiveSet';
import type LiveSet from 'live-set';
import type {Selector, ElementContext} from '..';

export default function createTransformer(scheduler: Scheduler, selectors: Array<Selector>): (liveSet: LiveSet<ElementContext>) => LiveSet<ElementContext> {
  const transformers = selectors.map(item => {
    if (typeof item === 'string') {
      const itemString = item;
      const flatMapFn = ec => createFilteredEcChildLiveSet(scheduler, ec, itemString);
      return liveSet => liveSetFlatMap(liveSet, flatMapFn);
    } else if (item.$or) {
      const transformers = item.$or.map(s => createTransformer(scheduler, s));
      return liveSet =>
        liveSetMerge(transformers.map(transformer =>
          transformer(liveSet)
        ));
    } else if (item.$watch) {
      const {attributeFilter, cond} = item.$watch;
      const flatMapFn = ec => createMutationObserverLiveSet(scheduler, ec, attributeFilter, cond);
      return liveSet => liveSetFlatMap(liveSet, flatMapFn);
    } else if (item.$log) {
      const {$log} = item;
      const filterFn = value => {
        console.log($log, value.el); //eslint-disable-line no-console
        return true;
      };
      return liveSet => liveSetFilter(liveSet, filterFn);
    } else if (item.$filter) {
      const {$filter} = item;
      const filterFn = ({el}) => $filter(el);
      return liveSet => liveSetFilter(liveSet, filterFn);
    } else if (item.$map) {
      const {$map} = item;
      const transducer = t.compose(
        t.map(ec => ({el: $map(ec.el), parents: ec.parents})),
        t.filter(ec => ec.el != null)
      );
      return liveSet => liveSetTransduce(liveSet, transducer);
    }
    throw new Error(`Invalid selector item: ${JSON.stringify(item)}`);
  });

  return transformers.reduce((combined, transformer) => {
    return liveSet => transformer(combined(liveSet));
  }, x => x);
}
