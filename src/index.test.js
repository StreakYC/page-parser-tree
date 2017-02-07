/* @flow */

import PageParserTree from '.';
import LiveSet from 'live-set';
import type {TagTreeNode} from 'tag-tree';
import EventEmitter from 'events';
import delay from 'pdelay';

const emitters = new WeakMap();
function ev(el: Element): EventEmitter {
  let emitter = emitters.get(el);
  if (!emitter) {
    emitter = new EventEmitter();
    emitters.set(el, emitter);
  }
  return emitter;
}

global.MutationObserver = class {
  _elements = [];
  _cb: Function;
  constructor(cb) {
    this._cb = cb;
  }
  _listener = mutations => {
    this._cb(mutations);
  };
  observe(element) {
    this._elements.push(element);
    ev(element).on('mutate', this._listener);
  }
  disconnect() {
    this._elements.forEach(el => ev(el).removeListener('mutate', this._listener));
  }
};

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

function qs(el: HTMLElement, selector: string): HTMLElement {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Selector failed to find element: ${selector}`);
  return result;
}

test('sync test', async () => {
  const page = new PageParserTree(document, {
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], selectors: [
        'body',
        'nav',
        {$tag: 'topnav'}
      ]},
      {sources: ['topnav'], selectors: [
        'div',
        'a',
        {$tag: 'navLink'}
      ]},
      {sources: ['topnav'], selectors: [
        'div',
        {$map: el => el.querySelector('a[href="blah"]')},
        {$filter: el => el.textContent !== 'five'},
        {$tag: 'navBlahFourLink'}
      ]},
      {sources: [null], selectors: [
        'body',
        '.page-sidebar',
        'div',
        {$tag: 'sidebarItem'}
      ]},
      {sources: [null], selectors: [
        'body',
        '.page-outer',
        '.article-comments',
        {$tag: 'commentSection'}
      ]},
      {sources: ['commentSection', 'replySection'], selectors: [
        {$or: [
          [
            '.comment'
          ], [
            '.comment2',
            '.comment2-inner'
          ]
        ]},
        {$tag: 'comment'}
      ]},
      {sources: ['comment'], selectors: [
        '.replies',
        {$tag: 'replySection'}
      ]},
    ],
    finders: {
      comment: {
        fn(root) {
          return root.querySelectorAll('.comment, .comment2-inner');
        }
      },
    }
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
    ev(foobarCommentParentElement).emit('mutate', [{
      addedNodes: [],
      removedNodes: [foobarComment.getValue()]
    }]);
  }

  await delay(0);

  expect(Array.from(topLevelComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'bar foo'
    ]);

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
    ]);
});

describe('validation', () => {
  test('ownedBy non-existent tag', () => {
    expect(() => new PageParserTree(document, {
      tags: {
        foo: {ownedBy: ['bar']}
      },
      watchers: [
        {sources: [null], selectors: [
          'body',
          'a',
          {$tag: 'foo'}
        ]}
      ],
      finders: {}
    })).toThrowError();
  });
});
