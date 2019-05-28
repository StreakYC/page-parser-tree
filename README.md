# page-parser-tree

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/StreakYC/page-parser-tree/blob/master/LICENSE.txt) [![Circle CI](https://circleci.com/gh/StreakYC/page-parser-tree.svg?style=shield)](https://circleci.com/gh/StreakYC/page-parser-tree) [![npm version](https://badge.fury.io/js/page-parser-tree.svg)](https://badge.fury.io/js/page-parser-tree)

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
rendered them to the screen. This means a browser extension can react to an
element and enhance it before it has appeared on the screen, preventing any
visible after-load pop-in effect.

Additionally, a "Finder" is an alternate and more adaptable method of
identifying elements to tag. It may be specified in addition to a "Watcher" to
provide redundancy, or by itself if the responsiveness of a "Watcher" isn't
necessary. To specify a "Finder", you write a function which takes the root
element and returns an array of all elements to tag, and this function will be
called on an interval to look for elements on the page to tag.
MutationObservers are not used here; there will be a likely user-noticeable
amount of time between the element appearing on the page and the PageParserTree
(and therefore your application) reacting to the presence of the element.

Finders are best used in addition to Watchers as a fallback-method to pick up
any elements missed by the Watchers. Watchers tend to be closely tied to the
known structure of the page, and may be brittle if the web application is
updated or variations of the structure are missed by a browser extension
developer. Finders are easier to make more robust to variations in the
structure of the page (you can use the `querySelectorAll` method to find
elements anywhere on the page matching some rule), but they don't have the
immediate responsiveness of Watchers. Use of them together creates a graceful
degradation route for when a web application's page structure exhibits
unforeseen variations.

A PageParserTree instance has a `tree` property which is an instance of a
[TagTree](https://github.com/StreakYC/tag-tree), which has methods such as
`getAllByTag(tag)` that returns a [LiveSet](https://github.com/StreakYC/live-set)
of TagTreeNodes. A TagTreeNode has a `getValue()` method to get the element it
contains, and `getParent()` and `getOwnedByTag(tag)` method to retrieve related
TagTreeNodes as described in TagTree's documentation.

## Example

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
// library:
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

Currently this method has some limitations:
* The `tree` TagTree will be emptied out as if all elements were removed from
  the page, and then the Watchers and Finders specified in the new options are
  started from scratch.
* An error will be thrown if the set of tags or any of their ownedBy lists
  change.

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

The finders property is required and must be an object. Each property names a
tag, and the value is a Finder object.

A Finder object has an `fn` property which must be a function. The `fn`
function must take an HTMLElement representing the root element of the
PageParserTree, and it must return an Array or Array-like object of the
HTMLElements to tag.

A finder object may have an `interval` property controlling how often in
milliseconds the Finder function is to be called. The `interval` property
defaults to 5000. The Finder function may be called less often than this
depending on page and user activity.

Alternative, `interval` may be a function that returns a number. The function
will be passed the number of elements that have currently been found on the
page, and the amount of time that has passed since the finder started running.
If there are a limited number of elements expected to be found, then this
allows the finder to throttle back after they're found. If the value Infinity
is returned, then the finder will not be run again.

#### PageParserTreeOptions::watchers
`PageParserTreeOptions::watchers: Array<Watcher>`

This property must be an array of Watcher objects. A Watcher object contains
the following properties:

```
{
  sources: Array<string|null>;
  tag: string;
  selectors: Array<Selector>;
}
```

A watcher functions by starting with a matched set of elements, and
transforming that matched set of elements into a new matched set of elements
iteratively by using the array of Selector values.

The sources array defines the initial matched set of elements. The value `null`
represents the root element given to the PageParserTree constructor (usually
the `document`). Strings may be given naming tags. Multiple sources may be
given. (Alternatively, multiple Watchers may be given for the same tag, if for
example the tagged element is to be found in very different parts of the page.)

The valid values for the Selector type are described in the Selectors section.

### Selectors

#### Children
`string`

This will change the matched set to contain only the direct children of each
element of the current matched set, and then filters those elements based on a
CSS selector string.

Note that if an element does not initially match the given CSS selector string
but is later modified to match it (e.g. the web application changed one of its
attributes some time after adding it to the page), then the Children selector
will not re-run the CSS selector check on the element. The Children selector
is only triggered by changes to an element's child list; the Watcher selector
must be used if you want to trigger by any other changes to an element.

#### Filter
`{ $filter: (el: HTMLElement) => boolean }`

This allows you to specify a function which will be called on every matched
element. If the function returns false, then the element will be removed from
the matched set.

#### Map
`{ $map: (el: HTMLElement) => ?HTMLElement }`
This allows you to specify a function which will be called on every matched
element, and each element in the matched set will be replaced with the element
returned by your function. If your function returns null, then the element will
just be removed from the matched set.

#### Watch
`{ $watch: { attributeFilter: string[], cond: string | (el: HTMLElement) => boolean } }`

This selector allows you to specify an array of attribute names to react to
changes to, and a CSS selector string or a function to evaluate the element
against. Every element will have the condition evaluated when it first becomes
part of the matched set and whenever any of the listed attributes are modified.

#### Or
`{ $or: Array<Array<Selector>> }`

For each array of selectors, this takes the current matched set and creates a
new matched set by applying the list of selectors to it. All of the resulting
matched sets are combined to create the output matched set. This selector can
be thought of as forking the selector list at a given point, using several
alternatives selector lists to continue it, and then recombining the results.

For an example, imagine a site where "message" elements all match the following
CSS selector string:

```css
body > div.main > div.border > div.message,
body > div.footer > div.message {}
```

Imagine for a moment that CSS supported a feature so that this was an
equivalent selector string:

```css
body > :or(div.main > div.border, div.footer) > div.message {}
```

PageParserTree's Or selector implements an operation like that. Here's an
example a PageParserTree Watcher supporting the above page structure:

```js
{
  sources: [null], tag: 'message', selectors: [
    'body',
    {$or: [
      [
        'div.main',
        'div.border'
      ], [
        'div.footer'
      ]
    ]},
    'div.message'
  ]
}
```

#### Log
`{ $log: string }`

This selector uses `console.log` to log every time an element becomes part of
the matched set at the given position in the chain. The given string will be
part of the logged message. This is intended for use in development while
debugging.

## Usage

PageParserTree may be installed with npm. We recommend you save the dependency
in your package.json and pin the major version by using the command `npm install --save page-parser-tree`.

PageParserTree may be used in browsers via a CommonJS bundler such as
Browserify or Webpack.

Some of the examples on this page use ES2015 features. ES2015 features aren't
required to use PageParserTree, though if you're writing a browser extension
targeting a modern browser, then you can probably use `let`/`const`
declarations and arrow functions without issue. Other features in the examples
including `import` statements may require Babel to be used. We've had good
experiences with Babel and highly recommend it, but if you aren't using it then
know that you can usually swap `import X from 'foo';` with
`const X = require('foo');`.

## Bundling Note

To use this module in browsers, a CommonJS bundler such as Browserify or
Webpack should be used.

This project may add additional checks in some places if `process.env.NODE_ENV`
is not set to "production". If you're using Browserify, then setting the
NODE_ENV environment variable to "production" during build is enough to disable
these checks. Instructions for other bundlers [can be found in React's
documentation](https://reactjs.org/docs/optimizing-performance.html#use-the-production-build),
which uses the same convention.

## Types

Both [TypeScript](https://www.typescriptlang.org/) and
[Flow](https://flowtype.org/) type definitions for this module are included!
The type definitions won't require any configuration to use.

## Resources

[Mixmax has written a blog post](https://mixmax.com/blog/precisely-observing-structural-page-changes)
with useful notes about their transition to using page-parser-tree and how it
solved some performance issues in their browser extension in Gmail.

## About

PageParserTree was written by us at [Streak](https://www.streak.com/), where we
produce the Streak CRM browser extension and the
[InboxSDK](https://www.inboxsdk.com/), a library for integrating with Gmail and
Inbox by Google, which you should also check out if you're reading this page
because you're considering writing a browser extension to integrate with them!
