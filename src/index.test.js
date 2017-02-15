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
  return [err.message, tagAndClassName(el), el.querySelector('.body').textContent];
}

function qs(el: HTMLElement, selector: string): HTMLElement {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Selector failed to find element: ${selector}`);
  return result;
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

  expect(Array.from(page.tree.getAllByTag('navBlahFourLink').values()).map(x => x.getValue().outerHTML))
    .toEqual([
      '<a href="blah">four</a>'
    ]);

  const allComments: LiveSet<TagTreeNode<HTMLElement>> = page.tree.getAllByTag('comment');
  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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
  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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

  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
    ]);

  expect(logError).toHaveBeenCalledTimes(0);
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
  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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
  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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

  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
    ]);

  expect(logError).toHaveBeenCalledTimes(0);
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
  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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
  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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

  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
    ]);

  expect(logError.mock.calls.map(logErrorSummary)).toEqual(expectedErrorsSummary);
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
  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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
  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'foo bar',
      'bar foo'
    ]);

  const foobarComment: TagTreeNode<HTMLElement> = Array.from(topLevelComments.values())[0];
  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = foobarComment.getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
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

  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(allComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
    ]);

  const expectedErrorsSummary = [
    ['watcher found element missed by finder', 'div.comment2-inner', 'SECOND'],
    ['watcher found element missed by finder', 'div.comment2-inner', 'THIRD'],
  ];
  expect(logError.mock.calls.map(logErrorSummary)).toEqual(expectedErrorsSummary);
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
