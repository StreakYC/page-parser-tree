/* @flow */

import PageParserTree from '.';
import LiveSet from 'live-set';
import type {TagTreeNode} from 'tag-tree';
import delay from 'pdelay';

import emitMutation from '../testlib/MockMutationObserver';
import tagAndClassName from '../testlib/tagAndClassName';

function setupPage() {
  if (!document.documentElement) throw new Error();
  document.documentElement.innerHTML = `
  <head></head>
  <body>
    <nav>
      <div>
        <a>one</a>
        <a>two</a>
      </div>
      <div>
        <a>three</a>
      </div>
      <div>
        <div>
          <div>
            <a href="blah">four</a>
          </div>
        </div>
      </div>
      <div>
        <div>
          <div>
            <a href="blah">five</a>
          </div>
        </div>
      </div>
    </nav>
    <div class="page-outer">
      <div>
        <article>blah</article>
      </div>
      <div class="article-comments">
        <div class="comment">
          <div class="body">foo bar</div>
          <div class="replies">
            <div class="comment">
              <div class="body">FIRST</div>
              <div class="replies"></div>
            </div>
            <div class="comment2">
              <div class="comment2-inner">
                <div class="body">SECOND</div>
                <div class="replies">
                  <div class="comment">
                    <div class="body">reply to second</div>
                    <div class="replies">
                      <div class="comment">
                        <div class="body">reply to you</div>
                        <div class="replies"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="comment2">
              <div class="comment2-inner">
                <div class="body">THIRD</div>
                <div class="replies"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="comment">
          <div class="body">bar foo</div>
          <div class="replies"></div>
        </div>
      </div>
    </div>
    <div class="page-sidebar">
      <div>thing</div>
      <div>bar</div>
    </div>
  </body>
  `;
}

beforeEach(setupPage);

function logErrorSummary([err, el]) {
  const bodyEl = el.querySelector('.body');
  const content = bodyEl ? bodyEl.textContent : el.outerHTML;
  return [err.message, tagAndClassName(el), content];
}

function qs(el: HTMLElement, selector: string): HTMLElement {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Selector failed to find element: ${selector}`);
  return result;
}

function getCommentNodeTextValue(node) {
  return qs(node.getValue(), '.body').textContent;
}

test('watchers', async () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'topnav', selectors: [
        'body',
        'nav'
      ]},
      {sources: ['topnav'], tag: 'navLink', selectors: [
        'div',
        'a'
      ]},
      {sources: ['topnav'], tag: 'navBlahFourLink', selectors: [
        'div',
        {$map: el => el.querySelector('a[href="blah"]')},
        {$filter: el => el.textContent !== 'five'}
      ]},
      {sources: [null], tag: 'sidebarItem', selectors: [
        'body',
        '.page-sidebar',
        'div'
      ]},
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        {$or: [
          [
            '.comment2',
            '.comment2-inner'
          ], [
            '.comment'
          ]
        ]}
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {}
  });

  expect(logError.mock.calls.map(logErrorSummary)).toEqual([]);

  expect(Array.from(page.tree.getAllByTag('navBlahFourLink').values()).map(x => x.getValue().outerHTML))
    .toEqual([
      '<a href="blah">four</a>'
    ]);

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo',
      'SECOND',
      'THIRD',
      'FIRST',
      'reply to second',
      'reply to you'
    ]);

  const topLevelComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getOwnedByTag('comment');
  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'SECOND',
      'THIRD',
      'FIRST'
    ]);

  {
    const foobarCommentParentElement: any = foobarComment.getValue().parentElement;
    foobarComment.getValue().remove();
    emitMutation(foobarCommentParentElement, {
      removedNodes: [foobarComment.getValue()]
    });
  }

  await delay(0);

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  expect(logError.mock.calls.map(logErrorSummary)).toEqual([]);

  expect(allComments.isEnded()).toBe(false);

  page.dump();

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  expect(allComments.isEnded()).toBe(true);
});

test('finders', async () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {
      'comment': {ownedBy: ['comment']}
    },
    watchers: [],
    finders: {
      comment: {
        interval: 5,
        fn(root) {
          return root.querySelectorAll('.comment, .comment2-inner');
        }
      }
    }
  });

  await delay(20);

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'FIRST',
      'SECOND',
      'reply to second',
      'reply to you',
      'THIRD',
      'bar foo'
    ]);

  const topLevelComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getOwnedByTag('comment');
  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'FIRST',
      'SECOND',
      'THIRD'
    ]);

  {
    const foobarCommentParentElement: any = foobarComment.getValue().parentElement;
    foobarComment.getValue().remove();
    emitMutation(foobarCommentParentElement, {
      removedNodes: [foobarComment.getValue()]
    });
  }

  await delay(20);

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  expect(logError).toHaveBeenCalledTimes(0);
  page.dump();
});

test('watchers and finders for separate tags', async () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {},
    finders: {
      topnav: {
        interval: 5,
        fn(root) {
          return root.querySelectorAll('nav');
        }
      }
    },
    watchers: [
      {sources: ['topnav'], tag: 'navLink', selectors: [
        'div',
        'a'
      ]},
    ]
  });
  const allTopNav = page.tree.getAllByTag('topnav');
  const allNavLinks = page.tree.getAllByTag('navLink');

  expect(allTopNav.values().size).toBe(0);
  expect(allNavLinks.values().size).toBe(0);

  await new Promise((resolve, reject) => {
    allTopNav.subscribe({next: resolve, error: reject});
  });

  expect(allTopNav.values().size).toBe(1);
  expect(allNavLinks.values().size).toBe(3);
  page.dump();
});

test('finder finding things watcher misses', async () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {
      'comment': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        '.comment' // Missing .comment2 handling
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {
      comment: {
        interval: 5,
        fn(root) {
          return root.querySelectorAll('.comment, .comment2-inner');
        }
      }
    }
  });

  expect(logError).toHaveBeenCalledTimes(0);

  await delay(20);

  const expectedErrorsSummary = [
    ['finder found element missed by watcher', 'div.comment2-inner', 'SECOND'],
    ['finder found element missed by watcher', 'div.comment2-inner', 'THIRD'],
  ];
  expect(logError.mock.calls.map(logErrorSummary)).toEqual(expectedErrorsSummary);

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo',
      'FIRST',
      'SECOND',
      'reply to second',
      'reply to you',
      'THIRD'
    ]);

  const topLevelComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getOwnedByTag('comment');
  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'FIRST',
      'SECOND',
      'THIRD'
    ]);

  {
    const foobarCommentParentElement: any = foobarComment.getValue().parentElement;
    foobarComment.getValue().remove();
    emitMutation(foobarCommentParentElement, {
      removedNodes: [foobarComment.getValue()]
    });
  }

  await delay(20);

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  expect(logError.mock.calls.map(logErrorSummary)).toEqual(expectedErrorsSummary);
  page.dump();
});

test('watcher finding things finder misses', async () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {
      'comment': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        {$or: [
          [
            '.comment'
          ], [
            '.comment2',
            '.comment2-inner'
          ]
        ]}
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {
      comment: {
        interval: 5,
        fn(root) {
          return root.querySelectorAll('.comment'); // missing .comment2-inner
        }
      }
    }
  });

  expect(logError).toHaveBeenCalledTimes(0);

  await delay(20);

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo',
      'FIRST',
      'SECOND',
      'THIRD',
      'reply to second',
      'reply to you'
    ]);

  const topLevelComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getOwnedByTag('comment');
  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'FIRST',
      'SECOND',
      'THIRD'
    ]);

  {
    const foobarCommentParentElement: any = foobarComment.getValue().parentElement;
    foobarComment.getValue().remove();
    emitMutation(foobarCommentParentElement, {
      removedNodes: [foobarComment.getValue()]
    });
  }

  await delay(20);

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(getCommentNodeTextValue))
    .toEqual([
    ]);

  const expectedErrorsSummary = [
    ['watcher found element missed by finder', 'div.comment2-inner', 'SECOND'],
    ['watcher found element missed by finder', 'div.comment2-inner', 'THIRD'],
  ];
  expect(logError.mock.calls.map(logErrorSummary)).toEqual(expectedErrorsSummary);
  page.dump();
});

xtest('replaceOptions', () => {
  const logError = jest.fn();
  const page = new PageParserTree(document, {
    logError,
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        '.comment'
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {}
  });

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo',
      'FIRST'
    ]);

  const topLevelComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getOwnedByTag('comment');
  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const allCommentsNext = jest.fn();
  const topLevelCommentsNext = jest.fn();
  const allCommentsSub = allComments.subscribe(allCommentsNext);
  const topLevelCommentsSub = topLevelComments.subscribe(topLevelCommentsNext);

  page.replaceOptions({
    logError,
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        {$or: [
          [
            '.comment2',
            '.comment2-inner'
          ], [
            '.comment'
          ]
        ]}
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {}
  });

  expect(Array.from(allComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo',
      'FIRST',
      'SECOND',
      'THIRD',
      'reply to second',
      'reply to you'
    ]);

  expect(Array.from(topLevelComments.values()).map(getCommentNodeTextValue))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  expect(logError.mock.calls.map(logErrorSummary)).toEqual([]);

  expect(allCommentsNext.mock.calls.map(([{type, value}]) =>
    [type, getCommentNodeTextValue(value)]
  )).toEqual([]);
  expect(topLevelCommentsNext.mock.calls.map(([{type, value}]) =>
    [type, getCommentNodeTextValue(value)]
  )).toEqual([]);

  allCommentsSub.pullChanges();
  topLevelCommentsSub.pullChanges();

  expect(allCommentsNext.mock.calls.map(([{type, value}]) =>
    [type, getCommentNodeTextValue(value)]
  )).toEqual([
    //TODO
  ]);
  expect(topLevelCommentsNext.mock.calls.map(([{type, value}]) =>
    [type, getCommentNodeTextValue(value)]
  )).toEqual([
    //TODO
  ]);

  page.dump();
});

test('replaceOptions throws if tags change', () => {
  const page = new PageParserTree(document, {
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        '.comment'
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {}
  });

  expect(() => page.replaceOptions({
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: []}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        '.page-outer',
        '.article-comments'
      ]},
      {sources: ['commentSection', 'replySection'], tag: 'comment', selectors: [
        '.comment'
      ]},
      {sources: ['comment'], tag: 'replySection', selectors: [
        '.replies'
      ]},
    ],
    finders: {}
  })).toThrowError('replaceOptions does not support tag changes');

  page.dump();
});

describe('validation', () => {
  test('ownedBy non-existent tag', () => {
    expect(() => new PageParserTree(document, {
      tags: {
        foo: {ownedBy: ['bar']}
      },
      watchers: [
        {sources: [null], tag: 'foo', selectors: [
          'body',
          'a'
        ]}
      ],
      finders: {}
    })).toThrowError();
  });
});
