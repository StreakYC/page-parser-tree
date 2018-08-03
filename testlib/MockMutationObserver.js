/* @flow */

import EventEmitter from 'events';

const emitters: WeakMap<Element, EventEmitter> = new WeakMap();
function ev(el: Element): EventEmitter {
  let emitter = emitters.get(el);
  if (!emitter) {
    emitter = new EventEmitter();
    emitters.set(el, emitter);
  }
  return emitter;
}

export default function emitMutation(el: Element, mutation: Object) {
  ev(el).emit('mutate', {
    target: el,
    addedNodes: [],
    removedNodes: [],
    ...mutation
  });
}

class MockMutationObserver {
  _elements = [];
  _changeRecords = [];
  _cb: Function;
  constructor(cb) {
    this._cb = cb;
  }
  _listener = mutation => {
    if (this._changeRecords.length === 0) {
      Promise.resolve().then(() => {
        const records = this.takeRecords();
        if (records.length) {
          this._cb(records);
        }
      });
    }
    this._changeRecords.push(mutation);
  };
  observe(element) {
    this._elements.push(element);
    ev(element).on('mutate', this._listener);
  }
  takeRecords() {
    const records = this._changeRecords;
    this._changeRecords = [];
    return records;
  }
  disconnect() {
    this._cb = () => {};
    this._elements.forEach(el =>
      ev(el).removeListener('mutate', this._listener)
    );
  }
}

global.MutationObserver = MockMutationObserver;
