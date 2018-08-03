/* @flow */

import t from 'transducers.js';
import type LiveSet from 'live-set';
import type Scheduler from 'live-set/Scheduler';
import liveSetTransduce from 'live-set/transduce';
import liveSetFilter from 'live-set/filter';
import liveSetMerge from 'live-set/merge';

import createCssFn from './createCssFn';

import watchMutations from './watchMutations';
import watchFilteredChildren from './watchFilteredChildren';

import type { Selector } from '..';
import type { ElementContext } from '../internalTypes';

export default function createTransformer(
  scheduler: Scheduler,
  selectors: Array<Selector>
): (liveSet: LiveSet<ElementContext>) => LiveSet<ElementContext> {
  const transformers = selectors.map(item => {
    if (typeof item === 'string') {
      const condFn = createCssFn(item);
      return liveSet => watchFilteredChildren(liveSet, condFn);
    } else if (item.$or) {
      const transformers = item.$or.map(s => createTransformer(scheduler, s));
      return liveSet =>
        liveSetMerge(transformers.map(transformer => transformer(liveSet)));
    } else if (item.$watch) {
      const { attributeFilter, cond } = item.$watch;
      const condFn = typeof cond === 'function' ? cond : createCssFn(cond);
      return liveSet => watchMutations(liveSet, attributeFilter, condFn);
    } else if (item.$log) {
      const { $log } = item;
      const filterFn = value => {
        console.log($log, value.el); //eslint-disable-line no-console
        return true;
      };
      return liveSet => liveSetFilter(liveSet, filterFn);
    } else if (item.$filter) {
      const { $filter } = item;
      const filterFn = ({ el }) => $filter(el);
      return liveSet => liveSetFilter(liveSet, filterFn);
    } else if (item.$map) {
      const { $map } = item;
      const transducer = t.compose(
        t.map(ec => ({ el: $map(ec.el), parents: ec.parents })),
        t.filter(ec => ec.el != null)
      );
      return liveSet => liveSetTransduce(liveSet, transducer);
    }
    throw new Error(`Invalid selector item: ${JSON.stringify(item)}`);
  });

  return transformers.reduce(
    (combined, transformer) => {
      return liveSet => transformer(combined(liveSet));
    },
    x => x
  );
}
