import type { ReactNode } from 'react';
import {
  isSafeUrl,
  type RichText,
  type RichTextInline,
  type RichTextNode,
} from '@wordpressjs/core';

function Inline({ node }: { node: RichTextInline }) {
  let child: ReactNode = node.type === 'text' ? node.text : <br />;
  for (const mark of node.marks || []) {
    switch (mark.type) {
      case 'bold':
        child = <strong>{child}</strong>;
        break;
      case 'italic':
        child = <em>{child}</em>;
        break;
      case 'underline':
        child = <u>{child}</u>;
        break;
      case 'link':
        if (isSafeUrl(mark.attrs.href)) child = <a href={mark.attrs.href}>{child}</a>;
        break;
    }
  }
  return child;
}
function Node({ node }: { node: RichTextNode }): ReactNode {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = node.content.map((item, index) => (
      <li key={index}>
        {item.content.map((child, i) => (
          <Node key={i} node={child} />
        ))}
      </li>
    ));
    return node.type === 'bulletList' ? (
      <ul>{items}</ul>
    ) : (
      <ol start={node.attrs.start}>{items}</ol>
    );
  }
  const children = node.content?.map((inline, i) => <Inline key={i} node={inline} />);
  if (node.type === 'paragraph') return <p>{children || <br />}</p>;
  return node.attrs.level === 2 ? <h2>{children}</h2> : <h3>{children}</h3>;
}
export function RichTextView({ value }: { value: RichText }) {
  return (
    <div className="site-rich-text">
      {value.content.map((node, i) => (
        <Node key={i} node={node} />
      ))}
    </div>
  );
}
