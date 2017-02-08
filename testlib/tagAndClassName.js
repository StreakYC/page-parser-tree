/* @flow */

export default function tagAndClassName(el: ?HTMLElement): string {
  return el ? el.nodeName.toLowerCase()+Array.from(el.classList).map(c => '.'+c).join('') : '<null>';
}
