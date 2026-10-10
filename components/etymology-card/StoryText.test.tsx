import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StoryText } from './StoryText'

const render = (text: string) => renderToStaticMarkup(<StoryText text={text} />)

describe('StoryText', () => {
  test('preserves plain cached prose and soft line wraps', () => {
    expect(render('A history of trust.')).toContain('<p>A history of trust.</p>')
    expect(render('A history\nof trust.')).toContain('<p>A history\nof trust.</p>')
  })

  test('renders blank-line paragraphs and italic word forms', () => {
    const markup = render('From *fides*, meaning faith.\r\n \r\nThen *fede*.\n\n\n')
    expect(markup).toContain('<p>From <em>fides</em>, meaning faith.</p>')
    expect(markup).toContain('<p>Then <em>fede</em>.</p>')
    expect(markup.match(/<p>/g)).toHaveLength(2)
  })

  test('keeps reconstruction markers, unmatched stars and unsupported bold literal', () => {
    const markup = render('From *bher- to *fides*. **Faith** remains *unfinished')
    expect(markup).toContain('From *bher- to <em>fides</em>. **Faith** remains *unfinished')
    expect(markup).not.toContain('<strong>')
  })

  test('escapes HTML and renders no Markdown links or images', () => {
    const markup = render(
      '<script>alert(1)</script>\n\n*<img src=x onerror=alert(1)>* [word](javascript:bad)'
    )
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(markup).toContain('<em>&lt;img src=x onerror=alert(1)&gt;</em>')
    expect(markup).not.toContain('<script>')
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('href=')
  })
})
