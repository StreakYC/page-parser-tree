/* @flow */

import matchesSelector from 'matches-selector-ng';

export default function createCssFn(
  selector: string
): (el: HTMLElement) => boolean {
  return el => matchesSelector(el, selector);
}
