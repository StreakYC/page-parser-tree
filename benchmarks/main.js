#!/usr/bin/env babel-node
/* @flow */
/* eslint-disable no-console */

const document = require('jsdom').jsdom(undefined);
global.__proto__ = document.defaultView;

import emitMutation from '../testlib/MockMutationObserver';
import assert from 'assert';
import delay from 'pdelay';
import type {default as _PageParserTree} from '../src';
const PageParserTree: Class<_PageParserTree> = (require('../src'): any);

function qs(el: HTMLElement|Document, selector: string): HTMLElement {
  const result = el.querySelector(selector);
  if (!result) throw new Error(`Selector failed to find element: ${selector}`);
  return result;
}

document.documentElement.innerHTML = `
<head></head>
<body>
  <div><nav></nav></div>
  <div></div>
  <div></div>
  <div>
    <div class="page-outer">
      <div>
        <article>blah</article>
      </div>
      <div class="article-comments">
        <div class="comment">
          <div class="body">foo bar</div>
          <div class="replies"></div>
        </div>
      </div>
    </div>
  </div>
  <div><footer></footer></div>
</body>
`;

async function main() {
  const firstCommentReplies = qs(document, '.comment > .replies');
  const repliesToStartWith = 3000;

  for (let i=0; i<repliesToStartWith; i++) {
    const reply = document.createElement('div');
    reply.className = 'comment';
    reply.innerHTML = `<div class="body">reply ${i}</div><div class="replies"></div>`;
    firstCommentReplies.appendChild(reply);
  }

  console.time('page-parser-tree init');
  const page = new PageParserTree(document, {
    logError(err, el) {
      console.error(err);
      if (el) console.error(el.outerHTML);
      throw err;
    },
    tags: {
      'comment': {ownedBy: ['comment']},
      'replySection': {ownedBy: ['comment']}
    },
    watchers: [
      {sources: [null], tag: 'commentSection', selectors: [
        'body',
        'div',
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
  console.timeEnd('page-parser-tree init');

  const comments = page.tree.getAllByTag('comment');
  assert.strictEqual(comments.values().size, repliesToStartWith+1);

  const articleComments = qs(document, '.article-comments');
  const articleCommentsParent = articleComments.parentElement;
  if (!articleCommentsParent) throw new Error();
  const articleComments2 = articleComments.cloneNode();
  articleComments2.innerHTML = articleComments.innerHTML;

  articleCommentsParent.appendChild(articleComments2);
  emitMutation(articleCommentsParent, {
    addedNodes: [articleComments2]
  });

  console.time('adding replies');
  await delay(0);
  assert.strictEqual(comments.values().size, 2*(repliesToStartWith+1));
  console.timeEnd('adding replies');
}

main().catch(err => {
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
});
