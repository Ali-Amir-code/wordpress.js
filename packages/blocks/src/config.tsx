import type { Config, CustomField } from '@puckeditor/core';
import {
  richTextFromPlainText,
  type BlockProps,
  type MediaSelection,
  type RichText,
} from '@wordpressjs/core';
import { BlockView } from './index';

const baseConfig: Config<Omit<BlockProps, 'MediaImage' | 'Text'>> = {
  root: { fields: {}, render: ({ children }) => <div className="site">{children}</div> },
  categories: {
    layout: { title: 'Sections', components: ['Hero', 'Features', 'CallToAction'] },
    content: { title: 'Content', components: ['Image', 'Quote', 'Spacer'] },
  },
  components: {
    Hero: {
      label: 'Hero section',
      fields: {
        eyebrow: { type: 'text', label: 'Eyebrow' },
        title: { type: 'textarea', label: 'Headline' },
        text: { type: 'textarea', label: 'Introduction' },
        buttonLabel: { type: 'text', label: 'Button label' },
        buttonHref: { type: 'text', label: 'Button link' },
        tone: {
          type: 'select',
          label: 'Background',
          options: [
            { label: 'Soft accent', value: 'tint' },
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ],
        },
      },
      defaultProps: {
        eyebrow: 'WELCOME TO SOMETHING GOOD',
        title: 'Your next chapter starts here.',
        text: 'Tell the world a little about what you do.',
        buttonLabel: 'Get in touch',
        buttonHref: 'mailto:hello@example.com',
        tone: 'tint',
      },
      render: (props) => (
        <BlockView
          block={{
            type: 'Hero',
            props: {
              id: props.id,
              eyebrow: props.eyebrow,
              title: props.title,
              text: props.text,
              buttonLabel: props.buttonLabel,
              buttonHref: props.buttonHref,
              tone: props.tone,
            },
          }}
        />
      ),
    },
    Features: {
      label: 'Feature grid',
      fields: {
        heading: { type: 'text' },
        items: {
          type: 'array',
          max: 12,
          arrayFields: { title: { type: 'text' }, text: { type: 'textarea' } },
          getItemSummary: (item) => item.title || 'Feature',
        },
      },
      defaultProps: {
        heading: 'A few things that make us, us.',
        items: [
          { title: 'Thoughtful by design', text: 'Share something your visitors will love.' },
          { title: 'Made for you', text: 'Another reason to get to know your work.' },
          { title: 'Here to help', text: 'Good people, doing good things.' },
        ],
      },
      render: ({ id, heading, items }) => (
        <BlockView block={{ type: 'Features', props: { id, heading, items } }} />
      ),
    },
    Image: {
      label: 'Image URL',
      fields: {
        src: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alternative text' },
        caption: { type: 'text' },
      },
      defaultProps: {
        src: '/placeholder.svg',
        alt: 'Abstract landscape placeholder',
        caption: 'Replace with a link to your own image.',
      },
      render: ({ id, src, alt, caption }) => (
        <BlockView block={{ type: 'Image', props: { id, src, alt, caption } }} />
      ),
    },
    CallToAction: {
      label: 'Call to action',
      fields: {
        title: { type: 'text' },
        text: { type: 'textarea' },
        buttonLabel: { type: 'text', label: 'Button label' },
        buttonHref: { type: 'text', label: 'Button link' },
      },
      defaultProps: {
        title: 'Let’s make something good.',
        text: 'We would love to hear from you.',
        buttonLabel: 'Say hello',
        buttonHref: 'mailto:hello@example.com',
      },
      render: ({ id, title, text, buttonLabel, buttonHref }) => (
        <BlockView
          block={{ type: 'CallToAction', props: { id, title, text, buttonLabel, buttonHref } }}
        />
      ),
    },
    Quote: {
      label: 'Quote',
      fields: { quote: { type: 'textarea' }, author: { type: 'text' } },
      defaultProps: {
        quote: 'A few words can make a big difference.',
        author: 'Someone worth listening to',
      },
      render: ({ id, quote, author }) => (
        <BlockView block={{ type: 'Quote', props: { id, quote, author } }} />
      ),
    },
    Spacer: {
      label: 'Space',
      fields: {
        size: {
          type: 'select',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      defaultProps: { size: 'medium' },
      render: ({ id, size }) => <BlockView block={{ type: 'Spacer', props: { id, size } }} />,
    },
  },
};

// The admin supplies the picker; shared blocks never import the admin or its API client.
export function createBlockConfig(
  mediaField: CustomField<MediaSelection | null>,
  textField: CustomField<string | RichText>,
): Config<BlockProps> {
  return {
    ...baseConfig,
    categories: {
      ...baseConfig.categories,
      content: { title: 'Content', components: ['Text', 'MediaImage', 'Image', 'Quote', 'Spacer'] },
    },
    components: {
      ...baseConfig.components,
      Text: {
        label: 'Text section',
        fields: { heading: { type: 'text', label: 'Heading' }, text: textField },
        defaultProps: {
          heading: 'A story worth sharing.',
          text: richTextFromPlainText('Start writing your story here.'),
        },
        render: ({ id, heading, text }) => (
          <BlockView block={{ type: 'Text', props: { id, heading, text } }} />
        ),
      },
      MediaImage: {
        label: 'Library image',
        fields: { asset: mediaField },
        defaultProps: { asset: null },
        render: ({ id, asset }) => (
          <BlockView block={{ type: 'MediaImage', props: { id, asset } }} />
        ),
      },
    },
  };
}
