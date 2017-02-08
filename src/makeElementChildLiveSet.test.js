/* @flow */

import makeElementChildLiveSet from './makeElementChildLiveSet';

import delay from 'pdelay';
import emitMutation from '../testlib/MockMutationObserver';
import tagAndClassName from '../testlib/tagAndClassName';

test('read', () => {
  const div = document.createElement('div');
  const divA = Object.assign(document.createElement('div'), {className: 'a'});
  const divB = Object.assign(document.createElement('div'), {className: 'b'});
  div.appendChild(divA);
  div.appendChild(divB);
  const liveSet = makeElementChildLiveSet(div);
  expect(Array.from(liveSet.values()).map(tagAndClassName)).toEqual([
    divA, divB
  ].map(tagAndClassName));
});

test('listen', async () => {
  const div = document.createElement('div');
  const divA = Object.assign(document.createElement('div'), {className: 'a'});
  const divB = Object.assign(document.createElement('div'), {className: 'b'});
  div.appendChild(divA);
  const liveSet = makeElementChildLiveSet(div);

  const next = jest.fn();
  liveSet.subscribe({next});

  div.appendChild(divB);
  emitMutation(div, {addedNodes: [divB], removedNodes: []});
  expect(next).toHaveBeenCalledTimes(0);
  await delay(0);
  expect(Array.from(liveSet.values()).map(tagAndClassName)).toEqual([
    divA, divB
  ].map(tagAndClassName));
  expect(next.mock.calls.map(changes => changes.map(([{type, value}]) => [type, tagAndClassName(value)]))).toEqual([
    [['add', 'div.b']]
  ]);
});

test('listen, pullChanges', async () => {
  const div = document.createElement('div');
  const divA = Object.assign(document.createElement('div'), {className: 'a'});
  const divB = Object.assign(document.createElement('div'), {className: 'b'});
  div.appendChild(divA);
  const liveSet = makeElementChildLiveSet(div);

  const next = jest.fn();
  const sub = liveSet.subscribe({next});

  div.appendChild(divB);
  emitMutation(div, {addedNodes: [divB], removedNodes: []});
  expect(Array.from(liveSet.values()).map(tagAndClassName)).toEqual([
    divA, divB
  ].map(tagAndClassName));

  expect(next).toHaveBeenCalledTimes(0);
  sub.pullChanges();
  expect(next.mock.calls.map(changes => changes.map(([{type, value}]) => [type, tagAndClassName(value)]))).toEqual([
    [['add', 'div.b']]
  ]);
  await delay(0);
  expect(Array.from(liveSet.values()).map(tagAndClassName)).toEqual([
    divA, divB
  ].map(tagAndClassName));
  expect(next.mock.calls.map(changes => changes.map(([{type, value}]) => [type, tagAndClassName(value)]))).toEqual([
    [['add', 'div.b']]
  ]);
});
