/**
 * Incremental scanner over streaming JSON text that emits each top-level
 * field of the root object as soon as its value closes.
 *
 * Same brace/string-state discipline as the fallback JSON extractor in
 * lib/llm.ts: strings (with escapes) are opaque, depth tracks {} and [].
 * State persists across push() calls, so fields split anywhere — including
 * mid-escape or mid-key — across chunk boundaries are handled.
 *
 * With strict structured outputs the model emits top-level keys in schema
 * order, so callers receive sections in render order (~10 per response).
 */

type ScannerPhase =
  | 'before_root'
  | 'expect_key'
  | 'in_key'
  | 'expect_colon'
  | 'expect_value'
  | 'in_string_value'
  | 'in_container_value'
  | 'in_primitive_value'
  | 'done'

export interface SectionScanner {
  /** Feed the next chunk of streamed text; fires the callback for any fields that close. */
  push(chunk: string): void
}

export function createSectionScanner(
  onSection: (section: string, data: unknown) => void
): SectionScanner {
  let buffer = ''
  let pos = 0
  let phase: ScannerPhase = 'before_root'
  let escaped = false
  let inString = false
  let depth = 0
  let keyStart = -1
  let key = ''
  let valueStart = -1

  const emit = (rawValue: string): void => {
    let data: unknown
    try {
      data = JSON.parse(rawValue)
    } catch {
      // Malformed slice — skip this section; the terminal result event
      // (or the parse-failure path) still handles the full response.
      return
    }
    onSection(key, data)
  }

  const push = (chunk: string): void => {
    buffer += chunk

    for (; pos < buffer.length; pos += 1) {
      const char = buffer[pos]

      switch (phase) {
        case 'before_root':
          if (char === '{') phase = 'expect_key'
          break

        case 'expect_key':
          if (char === '"') {
            phase = 'in_key'
            keyStart = pos
            escaped = false
          } else if (char === '}') {
            phase = 'done'
          }
          // Whitespace and the comma between fields are skipped here.
          break

        case 'in_key':
          if (escaped) {
            escaped = false
          } else if (char === '\\') {
            escaped = true
          } else if (char === '"') {
            try {
              key = JSON.parse(buffer.slice(keyStart, pos + 1)) as string
            } catch {
              key = buffer.slice(keyStart + 1, pos)
            }
            phase = 'expect_colon'
          }
          break

        case 'expect_colon':
          if (char === ':') phase = 'expect_value'
          break

        case 'expect_value':
          if (char === '"') {
            phase = 'in_string_value'
            valueStart = pos
            escaped = false
          } else if (char === '{' || char === '[') {
            phase = 'in_container_value'
            valueStart = pos
            depth = 1
            inString = false
            escaped = false
          } else if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
            phase = 'in_primitive_value'
            valueStart = pos
          }
          break

        case 'in_string_value':
          if (escaped) {
            escaped = false
          } else if (char === '\\') {
            escaped = true
          } else if (char === '"') {
            emit(buffer.slice(valueStart, pos + 1))
            phase = 'expect_key'
          }
          break

        case 'in_container_value':
          if (inString) {
            if (escaped) {
              escaped = false
            } else if (char === '\\') {
              escaped = true
            } else if (char === '"') {
              inString = false
            }
          } else if (char === '"') {
            inString = true
          } else if (char === '{' || char === '[') {
            depth += 1
          } else if (char === '}' || char === ']') {
            depth -= 1
            if (depth === 0) {
              emit(buffer.slice(valueStart, pos + 1))
              phase = 'expect_key'
            }
          }
          break

        case 'in_primitive_value':
          if (char === ',') {
            emit(buffer.slice(valueStart, pos).trim())
            phase = 'expect_key'
          } else if (char === '}') {
            emit(buffer.slice(valueStart, pos).trim())
            phase = 'done'
          }
          break

        case 'done':
          // Root object closed — ignore any trailing text.
          break
      }
    }
  }

  return { push }
}
