import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://raw.githubusercontent.com/lexibank/wold/v4.2/cldf'
const OUTPUT = join(process.cwd(), 'data', 'wold-ja.json')

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function records(text: string): Array<Record<string, string>> {
  const [headers, ...rows] = parseCsv(text)
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  )
}

async function fetchText(filename: string): Promise<string> {
  const response = await fetch(`${BASE}/${filename}`)
  if (!response.ok) throw new Error(`WOLD ${filename} download failed: ${response.status}`)
  return response.text()
}

const [formsText, borrowingsText] = await Promise.all([
  fetchText('forms.csv'),
  fetchText('borrowings.csv'),
])
const borrowingByTarget = new Map(
  records(borrowingsText).map((record) => [record.Target_Form_ID, record])
)
const output: Record<string, unknown[]> = {}

function indexKeys(value: string): string[] {
  const forms = value
    .split(/[、,;/]/)
    .map((form) => form.normalize('NFKC').trim().toLowerCase())
    .filter(Boolean)
  return [
    ...new Set(
      forms.flatMap((form) => [
        form,
        form
          .replace(/ā/g, 'aa')
          .replace(/ī/g, 'ii')
          .replace(/ū/g, 'uu')
          .replace(/ē/g, 'ee')
          .replace(/ō/g, 'oo'),
      ])
    ),
  ]
}

for (const form of records(formsText)) {
  if (form.Language_ID !== 'Japanese') continue
  const borrowing = borrowingByTarget.get(form.ID)
  const record = {
    id: form.ID,
    form: form.Form,
    script: form.original_script,
    borrowed: form.Borrowed,
    borrowedScore: form.Borrowed_score ? Number(form.Borrowed_score) : undefined,
    analyzability: form.Analyzability,
    gloss: form.gloss,
    age: form.Age,
    stratum: form.lexical_stratum,
    comment: form.comment_on_word_form,
    borrowedComment: form.comment_on_borrowed,
    etymologicalNote: form.etymological_note,
    sourceWord: borrowing?.Source_word,
    sourceLanguage: borrowing?.Source_languoid,
    sourceMeaning: borrowing?.Source_meaning,
    sourceCertain: borrowing?.Source_certain,
  }
  for (const key of [form.original_script, form.Form].filter(Boolean).flatMap(indexKeys)) {
    output[key] = [...(output[key] ?? []), record]
  }
}

await mkdir(join(process.cwd(), 'data'), { recursive: true })
await writeFile(
  OUTPUT,
  `${JSON.stringify({
    source: 'World Loanword Database Japanese vocabulary',
    version: 'lexibank/wold v4.2',
    license: 'CC BY 3.0 DE',
    licenseUrl: 'https://wold.clld.org/',
    generatedAt: new Date().toISOString(),
    entries: output,
  })}\n`
)
console.log(`WOLD Japanese: ${Object.keys(output).length} searchable forms`)
