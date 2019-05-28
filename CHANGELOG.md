## 0.4.0 (2019-05-28)

### Breaking Changes

- Updated LiveSet and TagTree dependencies to ^1.0.0.
- LiveSet update requires global `Map`, `Set`, and `Promise` support. A polyfill
  must be used if you're targeting browsers without native support for these.

### Improvements

- Added TypeScript type definitions.
- Upgraded to Babel 7.
- Added changelog.
