# page-parser-tree

[![Circle CI](https://circleci.com/gh/StreakYC/page-parser-tree.svg?style=shield)](https://circleci.com/gh/StreakYC/page-parser-tree)
[![npm version](https://badge.fury.io/js/page-parser-tree.svg)](https://badge.fury.io/js/page-parser-tree)

This module provides a declarative and robust way to recognize elements on a
dynamic webpage. This is useful for building browser extensions that offer rich
integration into complex and ever-changing web applications.

When a PageParserTree is instantiated, you provide it with a document or HTML
element reference to use as the root and an options object describing how to
identify specific types of elements on the page to be tagged with a given
identifier. PageParserTree will then produce a
[TagTree](https://github.com/StreakYC/tag-tree) instance of all of the tagged
elements found in the page. The TagTree instance will be kept up-to-date with
the page's contents through use of
[MutationObservers](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver).

To identify elements to tag, the primary method is to specify a "Watcher",
which uses a CSS selector-like syntax. A watcher specifies a tag name, a list
of sources including either the root element or previously-tagged elements to
initialize the matched set to, and an array of PageParserTree selectors used to  
transform the matched set to the set of elements to tag. The PageParserTree
selectors may take advantage of MutationObservers so that the page is watched
for changes and new elements can be found on the page before the browser has
rendered them to the screen, preventing any lag between the user seeing an
element on the screen and a browser extension reacting to its presence and
enhancing it for example.

Additionally, a "Finder" is an alternate and more adaptable method of
identifying elements to tag. It may be specified in addition to a "Watcher" to
provide redundancy, or by itself if the responsiveness of a "Watcher" isn't
necessary. To specify a "Finder", you write a function which takes the root
element and returns an array of all elements to tag, and this function will be
called on an interval to look for elements on the page to tag.
MutationObservers are not used here; there will be a likely user-noticeable
amount of time between the element appearing on the page and the PageParserTree
(and therefore your application) reacting to the presence of the element.
If a Finder is used for a tag that has any Watchers too, then an error will be
logged if the Finder and all of the Watchers for that tag are inconsistent with
each other so that they may be fixed.

Finders are best used in addition to Watchers as a fallback-method to pick up
any elements missed by the Watchers. Watchers tend to be closely tied to the
known structure of the page, and may be brittle if the web application is
updated or variations of the structure are missed by a browser extension
developer. Finders are easier to make more robust to variations in the
structure of the page (you can use the `querySelectorAll` method to find
elements anywhere on the page matching some rule), but they don't have the
immediate responsiveness of Watchers. Use of them together creates a graceful
degradation route when a web application's page structure exhibits unforeseen
variations.

A PageParserTree instance has a `tree` property which is an instance of a
[TagTree](https://github.com/StreakYC/tag-tree), which has methods such as
`getAllByTag(tag)` that returns a [LiveSet](https://github.com/StreakYC/live-set)
of TagTreeNodes. A TagTreeNode has a `getValue()` method to get the element it
contains, and `getParent()` and `getOwnedByTag(tag)` method to retrieve related
TagTreeNodes as described in TagTree's documentation and demonstrated below:

```js
import PageParserTree from 'page-parser-tree';

const page = new PageParserTree(document, {
  tags: {
    message: {
      ownedBy: ['thread']
    },
  },
  watchers: [
    {sources: [null], tag: 'thread', selectors: [
      'body',
      'div.page',
      'div.mainPanel',
      'div.thread'
    ]},
    {sources: ['thread'], tag: 'message', selectors: [
      'div.threadFooter',
      'div.replyArea',
      // Ignore and don't recurse into the div.replyArea element until the web
      // page changes its style attribute so that it's not hidden.
      {$watch: {
        attributeFilter: ['style'],
        cond: element => element.style.display !== 'none'
      }},
      'div.message'
    ]},
  ],
  finders: {
    thread: {
      fn: root => root.querySelectorAll('div.thread')
    },
    message: {
      fn: root => root.querySelectorAll('div.message')
    },
  }
});

// allMessages is a LiveSet of TagTreeNodes pointing to the message elements
const allMessages = page.tree.getAllByTag('message');

// We can inspect its current values.
allMessages.values().forEach(node => {
  const messageElement = node.getValue();
  console.log('found message element', messageElement);

  // The "message" tag was listed as being owned by the "thread" tag, so if
  // this message element is inside an element tagged as "thread", then we can
  // access that thread element.
  const ownerNode = node.getParent();
  // The watcher we gave to find message elements would only find ones contained
  // by threads, but the finder could find a message element not contained by a
  // thread. If for example the web application was updated to have thread
  // elements contain a class name other than "thread", then the watchers would
  // fail to find threads or messages, and the finders would only find messages
  // that are owned by the tree root instead of by threads.
  if (ownerNode.getTag() === 'thread') {
    const threadElement = ownerNode.getValue();
    console.log('message owned by thread', threadElement);

    // From a node, you can also retrieve its nodes. messagesOfThread is also
    // a LiveSet of TagTreeNodes like allMessages.
    const messagesOfThread = ownerNode.getOwnedByTag('message');
    console.log('message is one of', messagesOfThread.values().size, 'messages in thread');
  }
});

// We can also subscribe to changes in a LiveSet's values.
allMessages.subscribe(changes => {
  changes.forEach(change => {
    if (change.type === 'add') {
      console.log('added message element', change.value.getValue());
    } else if (change.type === 'remove') {
      console.log('removed message element', change.value.getValue());
    }
  });
});

// If we just want to call some callbacks for every present and future message
// and when they're removed, then we can use a handy helper from the LiveSet
// library.
import toValueObservable from 'live-set/toValueObservable';

toValueObservable(allMessages).subscribe(({value, removal}) => {
  const messageElement = value.getValue();
  console.log('found message element', messageElement);

  removal.then(() => {
    console.log('message element removed from page', messageElement);
  });
});
```

## API

### Functions

#### PageParserTree::constructor
`PageParserTree::constructor(root: Document|HTMLElement, options: PageParserTreeOptions)`

This creates a new PageParserTree instance which will immediately start
populating a TagTree instance based on the options given. See the
PageParserTreeOptions for a full description of the options parameter.

#### PageParserTree::tree
`PageParserTree::tree: TagTree<HTMLElement>`

This property contains the TagTree instance that the tagged elements can be
accessed from. See the documentation of
[TagTree](https://github.com/StreakYC/tag-tree) for information about the API
of TagTree instances.

#### PageParserTree::dump
`PageParserTree::dump(): void`

This causes the PageParserTree instance to halt all of its Watchers and
Finders, to empty out the `tree` TagTree as if all of the tagged elements were
removed from the page, and to end all of the TagTree's LiveSets so that they no
longer keep references to their subscribers. This function is useful if you are
performing a clean shutdown of the browser extension while letting the web page
continue to operate.

#### PageParserTree::replaceOptions
`PageParserTree::replaceOptions(options: PageParserTreeOptions): void`

This replaces the options object that the PageParserTree was instantiated with.
This is mainly intended for use in development with hot module replacement to
allow live-editing of the options within a running page.

Currently this method empties out the `tree` TagTree as if all elements were
removed, and then the Watchers and Finders specified in the new options are
started from scratch.

### PageParserTreeOptions

The PageParserTreeOptions specifies the Watchers and Finders used to populate
the TagTree and other options.

#### PageParserTreeOptions::logError
`PageParserTreeOptions::logError(err: Error, el: ?HTMLElement): void`

This is an optional property specifying a function to be called if
PageParserTree encounters an error. It will be passed an Error object and
optionally an HTMLElement if one is relevant.

The main reason PageParserTree will call logError is if there are Watchers and
a Finder for a tag and they are inconsistent with each other. The error message
will include the name of the tag, and the element which was missed by one of
them will be passed to logError.

#### PageParserTreeOptions::tags
`PageParserTreeOptions::tags: {[tag:string]: TagOptions}`

The tags property is required and must be an object. Each property must be a
tag name with a value containing a TagOptions object. Not all tags need to have
an entry here; it's legal to pass an empty object as the tags property.

TagOptions is an object that has an optional `ownedBy` property which may be an
array of strings referring to other tag names. Each node in a TagTree is owned
by another node, defaulting to the root node. If you specify any tag names
in the `ownedBy` array, then any node of this tag will be owned by the node of
the closest ancestor with a tag in the `ownedBy` array if any are present.

A tag may own itself; this is useful to represent hierarchical user-interfaces
such as comment trees on reddit where a comment element may be the owner of its
direct replies.

It is an error to pass options for a tag name that has no Watchers or Finders.

#### PageParserTreeOptions::finders
`PageParserTreeOptions::finders: {[tag:string]: Finder}`

A Finder object has an `fn` property which must be a function. The `fn`
function must take an HTMLElement representing the root element of the
PageParserTree, and it must return an Array or Array-like object of the
HTMLElements to tag.

A finder object may have an `interval` property controlling how often in
milliseconds the Finder function is to be called. The `interval` property
defaults to 5000. The Finder function may be called less often that this
depending on page and user activity.

#### PageParserTreeOptions::watchers

TODO

## Types

[Flow](https://flowtype.org/) type declarations for this module are included!
If you are using Flow, they won't require any configuration to use.

## About

PageParserTree was written by us at [Streak](https://www.streak.com/), where we
produce the Streak CRM browser extension and the
[InboxSDK](https://www.inboxsdk.com/), a library for integrating with Gmail and
Inbox by Google, which you should also check out if you're reading this page
because you're considering writing a browser extension to integrate with them!
