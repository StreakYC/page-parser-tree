/* @flow */

import PageParserTree from '.';
import LiveSet from 'live-set';
import type {TagTreeNode} from 'tag-tree';

global.MutationObserver = class {
  observe() {}
  disconnect() {}
};

global._log = '';

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

test('works', async () => {
  const page = new PageParserTree(document, [
    {sources: [null], selectors: [
      'body',
      'nav',
      'div',
      'a',
      {$tag: 'navLink'}
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
      {$tag: 'comment', ownedBy: ['comment']}
    ]},
    {sources: ['comment'], selectors: [
      '.replies',
      {$tag: 'replySection', ownedBy: ['comment']}
    ]}
  ]);

  // await delay(0);

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

  const foobarComments: LiveSet<TagTreeNode<HTMLElement>> = Array.from(topLevelComments.values())[0].getOwnedByTag('comment');

  expect(Array.from(foobarComments.values()).map(x=>qs(x.getValue(), '.body').textContent))
    .toEqual([
      'FIRST',
      'SECOND',
      'THIRD'
    ]);
});
