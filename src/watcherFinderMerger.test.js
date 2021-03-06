/* @flow */

import watcherFinderMerger from './watcherFinderMerger';

import LiveSet from 'live-set';
import { TagTree } from 'tag-tree';
import delay from 'pdelay';
import tagAndClassName from '../testlib/tagAndClassName';

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

function serializeEc(ec) {
  return [
    tagAndClassName(ec.el),
    ec.parents.map(({ tag, node }) => ({
      tag,
      el: tagAndClassName(node.getValue())
    }))
  ];
}

const { documentElement, body: documentBody } = document;
const commentA = document.querySelector('.comment.a');
const commentA1 = document.querySelector('.comment.a1');
const commentA2 = document.querySelector('.comment.a2');
const commentB = document.querySelector('.comment.b');
if (
  !documentElement ||
  !documentBody ||
  !commentA ||
  !commentA1 ||
  !commentA2 ||
  !commentB
)
  throw new Error();

const { tagTree, nodeA } = (() => {
  let nodeA, nodeA1, nodeA2, nodeB;
  const tagTree = new TagTree({
    root: documentElement,
    tags: [{ tag: 'comment', ownedBy: ['comment'] }],
    executor(tagTreeController) {
      nodeA = tagTreeController.addTaggedValue(
        tagTreeController.tree,
        'comment',
        commentA
      );
      nodeA1 = tagTreeController.addTaggedValue(nodeA, 'comment', commentA1);
      nodeA2 = tagTreeController.addTaggedValue(nodeA, 'comment', commentA2);
      nodeB = tagTreeController.addTaggedValue(
        tagTreeController.tree,
        'comment',
        commentB
      );
    }
  });
  if (!nodeA || !nodeA1 || !nodeA2 || !nodeB) throw new Error();
  return { tagTree, nodeA, nodeA1, nodeA2, nodeB };
})();

const watcherValues = [
  { el: commentA, parents: [{ tag: null, node: tagTree }] },
  {
    el: commentA1,
    parents: [{ tag: null, node: tagTree }, { tag: 'comment', node: nodeA }]
  },
  {
    el: commentA2,
    parents: [{ tag: null, node: tagTree }, { tag: 'comment', node: nodeA }]
  },
  { el: commentB, parents: [{ tag: null, node: tagTree }] }
];

test('watcher only', async () => {
  const { liveSet: input, controller } = LiveSet.active(
    new Set(watcherValues.slice(0, 1))
  );

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    input,
    null,
    logError
  );

  output.subscribe({ next, complete });
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.slice(0, 1).map(serializeEc)
  );

  for (let i = 1; i < watcherValues.length; i++) {
    controller.add(watcherValues[i]);
    await delay(0);
    expect(
      next.mock.calls
        .slice(i - 1, i)
        .map(([changes]) =>
          changes.map(({ type, value }) => [type, serializeEc(value)])
        )
    ).toEqual([
      watcherValues.slice(i, i + 1).map(ec => ['add', serializeEc(ec)])
    ]);
    expect(Array.from(output.values()).map(serializeEc)).toEqual(
      watcherValues.slice(0, i + 1).map(serializeEc)
    );
  }

  expect(logError).toHaveBeenCalledTimes(0);
  expect(complete).toHaveBeenCalledTimes(0);
  controller.end();
  await delay(0);
  expect(complete).toHaveBeenCalledTimes(1);
});

test('finder only', async () => {
  const finder = {
    interval: 20,
    fn(root) {
      return root.querySelectorAll('.comment');
    }
  };

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    null,
    finder,
    logError
  );

  output.subscribe({ next, complete });
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([]);

  await delay(50);
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.map(ec => ['add', serializeEc(ec)])]);
  expect(logError).toHaveBeenCalledTimes(0);

  const commentA1parent = commentA1.parentElement;
  if (!commentA1parent) throw new Error();
  commentA1.remove();

  await delay(50);
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([
    watcherValues.map(ec => ['add', serializeEc(ec)]),
    [
      [
        'remove',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ]
  ]);
  expect(logError).toHaveBeenCalledTimes(0);

  commentA1parent.appendChild(commentA1);
  await delay(50);

  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([
    watcherValues.map(ec => ['add', serializeEc(ec)]),
    [
      [
        'remove',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ],
    [
      [
        'add',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ]
  ]);
  expect(logError).toHaveBeenCalledTimes(0);
});

test('consistent watcher and finder', async () => {
  const { liveSet: input, controller } = LiveSet.active(
    new Set(watcherValues.slice(0, 1))
  );

  let finderFn = root =>
    Array.from(root.querySelectorAll('.comment')).slice(0, 1);

  const finder = {
    interval: 20,
    fn(root) {
      return finderFn(root);
    }
  };

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    input,
    finder,
    logError
  );

  output.subscribe({ next, complete });
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.slice(0, 1).map(serializeEc)
  );

  await delay(0);
  watcherValues.slice(1).forEach(ec => {
    controller.add(ec);
  });
  finderFn = root => root.querySelectorAll('.comment');

  await delay(50);
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.slice(1).map(ec => ['add', serializeEc(ec)])]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([]);
});

test('bad watcher and good finder', async () => {
  const { liveSet: input, controller } = LiveSet.active(
    new Set(watcherValues.slice(0, 1))
  );

  let finderFn = root =>
    Array.from(root.querySelectorAll('.comment')).slice(0, 1);
  const finder = {
    interval: 20,
    fn(root) {
      return finderFn(root);
    }
  };

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    input,
    finder,
    logError
  );

  output.subscribe({ next, complete });
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.slice(0, 1).map(serializeEc)
  );

  await delay(0);
  watcherValues.slice(2 /* skip 1 */).forEach(ec => {
    controller.add(ec);
  });
  finderFn = root => root.querySelectorAll('.comment');

  await delay(50);
  const reorderedWatcherValues = watcherValues
    .slice(0, 1)
    .concat(watcherValues.slice(2), watcherValues.slice(1, 2));

  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    reorderedWatcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([
    reorderedWatcherValues.slice(1, 3).map(ec => ['add', serializeEc(ec)]),
    reorderedWatcherValues.slice(3).map(ec => ['add', serializeEc(ec)])
  ]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ]
  ]);

  const commentA1parent = commentA1.parentElement;
  if (!commentA1parent) throw new Error();
  commentA1.remove();

  await delay(50);
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([
    reorderedWatcherValues.slice(1, 3).map(ec => ['add', serializeEc(ec)]),
    reorderedWatcherValues.slice(3).map(ec => ['add', serializeEc(ec)]),
    [
      [
        'remove',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ]
  ]);
  expect(logError).toHaveBeenCalledTimes(1);

  commentA1parent.insertBefore(commentA1, commentA1parent.firstElementChild);
  await delay(50);

  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([
    reorderedWatcherValues.slice(1, 3).map(ec => ['add', serializeEc(ec)]),
    reorderedWatcherValues.slice(3).map(ec => ['add', serializeEc(ec)]),
    [
      [
        'remove',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ],
    [
      [
        'add',
        [
          'div.comment.a1',
          [{ tag: null, el: 'html' }, { tag: 'comment', el: 'div.comment.a' }]
        ]
      ]
    ]
  ]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ]
  ]);
});

test('good watcher and bad finder', async () => {
  const { liveSet: input, controller } = LiveSet.active(
    new Set(watcherValues.slice(0, 1))
  );

  let finderFn = root =>
    Array.from(root.querySelectorAll('.comment')).slice(0, 1);
  const finder = {
    interval: 20,
    fn(root) {
      return finderFn(root);
    }
  };

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    input,
    finder,
    logError
  );

  output.subscribe({ next, complete });
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.slice(0, 1).map(serializeEc)
  );

  await delay(0);
  watcherValues.slice(1).forEach(ec => {
    controller.add(ec);
  });
  finderFn = root => root.querySelectorAll('.comment:not(.a1)');

  await delay(50);
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.slice(1).map(ec => ['add', serializeEc(ec)])]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) watcher found element missed by finder',
      'div.comment.a1'
    ]
  ]);
});

test('watcher finds element after finder', async () => {
  const { liveSet: input, controller } = LiveSet.active(
    new Set(watcherValues.slice(0, 1))
  );

  let finderFn = root =>
    Array.from(root.querySelectorAll('.comment')).slice(0, 1);
  const interval = jest.fn(() => 20);
  const finder = {
    interval,
    fn(root) {
      return finderFn(root);
    }
  };

  const logError = jest.fn(),
    next = jest.fn(),
    complete = jest.fn();
  const output = watcherFinderMerger(
    LiveSet.defaultScheduler,
    tagTree,
    'comment',
    { ownedBy: ['comment'] },
    input,
    finder,
    logError
  );

  output.subscribe({ next, complete });

  expect(interval.mock.calls.length).toBe(1);
  expect(interval.mock.calls[interval.mock.calls.length - 1][0]).toBe(1);
  expect(
    interval.mock.calls[interval.mock.calls.length - 1][1]
  ).toBeGreaterThanOrEqual(0);
  expect(interval.mock.calls[interval.mock.calls.length - 1][1]).toBeLessThan(
    50
  );

  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.slice(0, 1).map(serializeEc)
  );

  finderFn = root => root.querySelectorAll('.comment');
  await delay(50);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.slice(1).map(ec => ['add', serializeEc(ec)])]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a2'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.b'
    ]
  ]);

  expect(interval.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(interval.mock.calls[interval.mock.calls.length - 1][0]).toBe(4);
  expect(
    interval.mock.calls[interval.mock.calls.length - 1][1]
  ).toBeGreaterThanOrEqual(30);

  watcherValues.slice(2 /* skip 1 */).forEach(ec => {
    controller.add(ec);
  });

  await delay(50);

  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.slice(1).map(ec => ['add', serializeEc(ec)])]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a2'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.b'
    ],
    [
      'PageParserTree(comment) watcher found element already found by finder',
      'div.comment.a2'
    ],
    [
      'PageParserTree(comment) watcher found element already found by finder',
      'div.comment.b'
    ]
  ]);

  controller.remove(watcherValues[3]);

  await delay(50);
  expect(Array.from(output.values()).map(serializeEc)).toEqual(
    watcherValues.map(serializeEc)
  );
  expect(
    next.mock.calls.map(([changes]) =>
      changes.map(({ type, value }) => [type, serializeEc(value)])
    )
  ).toEqual([watcherValues.slice(1).map(ec => ['add', serializeEc(ec)])]);
  expect(
    logError.mock.calls.map(([err, el]) => [err.message, tagAndClassName(el)])
  ).toEqual([
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a1'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.a2'
    ],
    [
      'PageParserTree(comment) finder found element missed by watcher',
      'div.comment.b'
    ],
    [
      'PageParserTree(comment) watcher found element already found by finder',
      'div.comment.a2'
    ],
    [
      'PageParserTree(comment) watcher found element already found by finder',
      'div.comment.b'
    ]
  ]);
});
