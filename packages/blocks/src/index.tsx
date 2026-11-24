import { mediaPath, type Block, type ContentDocument } from '@wordpressjs/core';

export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'MediaImage': {
      const asset = block.props.asset;
      return asset ? (
        <figure id={block.props.id} className="site-section site-wrap site-image">
          <img
            src={mediaPath(asset.id)}
            width={asset.width}
            height={asset.height}
            alt={asset.alt}
            loading="lazy"
          />
          {asset.caption && <figcaption>{asset.caption}</figcaption>}
        </figure>
      ) : (
        <div className="site-wrap site-section">Choose an image from your media library.</div>
      );
    }
    case 'Hero':
      return (
        <section id={block.props.id} className={`site-hero tone-${block.props.tone}`}>
          <div className="site-wrap">
            <p className="site-eyebrow">{block.props.eyebrow}</p>
            <h1>{block.props.title}</h1>
            <p className="site-lead">{block.props.text}</p>
            {block.props.buttonLabel && (
              <a className="site-button" href={block.props.buttonHref}>
                {block.props.buttonLabel}
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
          <div className="site-orbit" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </section>
      );
    case 'Text':
      return (
        <section id={block.props.id} className="site-section site-prose site-wrap">
          {block.props.heading && <h2>{block.props.heading}</h2>}
          {block.props.text.split(/\n\s*\n/).map((part, index) => (
            <p key={index}>{part}</p>
          ))}
        </section>
      );
    case 'Features':
      return (
        <section id={block.props.id} className="site-section site-wrap">
          <h2>{block.props.heading}</h2>
          <div className="site-features">
            {block.props.items.map((item, i) => (
              <article key={i}>
                <span className="site-feature-number">{String(i + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
      );
    case 'Image':
      return (
        <figure id={block.props.id} className="site-section site-wrap site-image">
          <img
            src={block.props.src}
            alt={block.props.alt}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {block.props.caption && <figcaption>{block.props.caption}</figcaption>}
        </figure>
      );
    case 'CallToAction':
      return (
        <section id={block.props.id} className="site-section site-cta site-wrap">
          <div>
            <h2>{block.props.title}</h2>
            <p>{block.props.text}</p>
          </div>
          {block.props.buttonLabel && (
            <a href={block.props.buttonHref} className="site-button">
              {block.props.buttonLabel}
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </section>
      );
    case 'Quote':
      return (
        <figure id={block.props.id} className="site-section site-wrap site-quote">
          <blockquote>{block.props.quote}</blockquote>
          <figcaption>{block.props.author}</figcaption>
        </figure>
      );
    case 'Spacer':
      return <div aria-hidden="true" className={`site-spacer size-${block.props.size}`} />;
  }
}
export function DocumentView({ document }: { document: ContentDocument }) {
  return (
    <>
      {document.content.map((block) => (
        <BlockView key={block.props.id} block={block} />
      ))}
    </>
  );
}
