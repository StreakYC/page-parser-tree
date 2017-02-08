/* @flow */

import watcherFinderMerger from './watcherFinderMerger';

import LiveSet from 'live-set';
import {TagTree} from 'tag-tree';

function setupPage() {
  if (!document.documentElement) throw new Error();
  document.documentElement.innerHTML = `
  <head></head>
  <body>
    <div class="page-outer">
      <div>
        <article>blah</article>
      </div>
      <div class="article-comments">
        <div class="comment a">
          <div class="body">A</div>
          <div class="replies">
            <div class="comment a1">
              <div class="body">A1</div>
              <div class="replies"></div>
            </div>
            <div class="comment a2">
              <div class="body">A2</div>
              <div class="replies"></div>
            </div>
          </div>
        </div>
        <div class="comment b">
          <div class="body">B</div>
          <div class="replies"></div>
        </div>
      </div>
    </div>
  </body>
  `;
}

setupPage();

function tagAndClassName(el: ?HTMLElement): string {
  return el ? el.nodeName.toLowerCase()+Array.from(el.classList).map(c => '.'+c).join('') : '<null>';
}

function serializeEc(ec) {
  return [tagAndClassName(ec.el), ec.parents.map(({tag, node}) => ({tag, el: tagAndClassName(node.getValue())}))];
}

const {documentElement, body: documentBody} = document;
const commentA = document.querySelector('.comment.a');
const commentA1 = document.querySelector('.comment.a1');
const commentA2 = document.querySelector('.comment.a2');
const commentB = document.querySelector('.comment.b');
if (!documentElement || !documentBody || !commentA || !commentA1 || !commentA2 || !commentB) throw new Error();

const {tagTree, nodeA} = (() => {
  let nodeA, nodeA1, nodeA2, nodeB;
  const tagTree = new TagTree({
    root: documentElement,
    tags: [{tag: 'comment', ownedBy: ['comment']}],
    executor(tagTreeController) {
      nodeA = tagTreeController.addTaggedValue(tagTreeController.tree, 'comment', commentA);
      nodeA1 = tagTreeController.addTaggedValue(nodeA, 'comment', commentA1);
      nodeA2 = tagTreeController.addTaggedValue(nodeA, 'comment', commentA2);
      nodeB = tagTreeController.addTaggedValue(tagTreeController.tree, 'comment', commentB);
    }
  });
  if (!nodeA || !nodeA1 || !nodeA2 || !nodeB) throw new Error();
  return {tagTree, nodeA, nodeA1, nodeA2, nodeB};
})();

const watcherValues = [
  {el: commentA, parents: [{tag: null, node: tagTree}]},
  {el: commentA1, parents: [{tag: null, node: tagTree}, {tag: 'comment', node: nodeA}]},
  {el: commentA2, parents: [{tag: null, node: tagTree}, {tag: 'comment', node: nodeA}]},
  {el: commentB, parents: [{tag: null, node: tagTree}]},
];

test('read with watcher', () => {
  const {liveSet: input} = LiveSet.active(new Set(watcherValues));

  const logError = jest.fn();
  const output = watcherFinderMerger(tagTree, {ownedBy: ['comment']}, input, null, logError);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(watcherValues.map(serializeEc));
  expect(logError).toHaveBeenCalledTimes(0);
});

test('read with finder', () => {
  const finder = {
    interval: 20,
    fn(root) {
      return root.querySelectorAll('.comment');
    }
  };

  const logError = jest.fn();
  const output = watcherFinderMerger(tagTree, {ownedBy: ['comment']}, null, finder, logError);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(watcherValues.map(serializeEc));
  expect(logError).toHaveBeenCalledTimes(0);
});

test('read with consistent watcher and finder', () => {
  const {liveSet: input} = LiveSet.active(new Set(watcherValues));

  const finder = {
    interval: 20,
    fn(root) {
      return root.querySelectorAll('.comment');
    }
  };

  const logError = jest.fn();
  const output = watcherFinderMerger(tagTree, {ownedBy: ['comment']}, input, finder, logError);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(watcherValues.map(serializeEc));
  expect(logError).toHaveBeenCalledTimes(0);
});


test('read with bad watcher and good finder', () => {
  const {liveSet: input} = LiveSet.active(new Set(watcherValues.slice(0, 2)));

  const finder = {
    interval: 20,
    fn(root) {
      return root.querySelectorAll('.comment');
    }
  };

  const logError = jest.fn();
  const output = watcherFinderMerger(tagTree, {ownedBy: ['comment']}, input, finder, logError);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(watcherValues.map(serializeEc));
  expect(logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])).toEqual([
    ['finder found element missed by watcher', 'div.comment.a2'],
    ['finder found element missed by watcher', 'div.comment.b'],
  ]);

  // Check that we don't logError for the same elements again
  output.values();
  expect(logError).toHaveBeenCalledTimes(2);
});

test('read with good watcher and bad finder', () => {
  const {liveSet: input} = LiveSet.active(new Set(watcherValues));

  const finder = {
    interval: 20,
    fn(root) {
      return root.querySelectorAll('.comment.a, .comment.a1');
    }
  };

  const logError = jest.fn();
  const output = watcherFinderMerger(tagTree, {ownedBy: ['comment']}, input, finder, logError);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(watcherValues.map(serializeEc));
  expect(logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])).toEqual([
    ['watcher found element missed by finder', 'div.comment.a2'],
    ['watcher found element missed by finder', 'div.comment.b'],
  ]);

  // Check that we don't logError for the same elements again
  output.values();
  expect(logError).toHaveBeenCalledTimes(2);
});
