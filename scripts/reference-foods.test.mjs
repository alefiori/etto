import { describe, it, expect } from 'vitest'
import {
  CIQUAL_CONSTITUENTS,
  cofidColumns,
  decodeXml,
  fromCsv,
  parseCiqual,
  parseCiqualGroups,
  parseCofid,
  parseCofidValue,
  parseCrea,
  parseCreaDetail,
  parseCreaValue,
  parseTeneur,
  resolveConstCodes,
  toCsv,
  toDbRow,
  xmlField,
  xmlRecords,
} from './reference-foods.mjs'

// ---------------------------------------------------------------------------
// Value parsing — the policy that decides whether a food ships at all.
// ---------------------------------------------------------------------------

describe('parseTeneur (Ciqual)', () => {
  it.each([
    ['80,6', 80.6, 'number'], // French decimal comma
    ['  59,7  ', 59.7, 'number'], // Ciqual pads every field
    ['0', 0, 'number'],
    ['1140', 1140, 'number'],
    ['traces', 0, 'trace'],
    ['< 0,2', 0, 'trace'], // a bound below the trace ceiling is a trace
    ['<0.5', 0, 'trace'],
    ['< 10', null, 'unknown'], // a bound above it is genuinely unknown
    ['-', null, 'unknown'],
    ['', null, 'unknown'],
    [null, null, 'unknown'], // <teneur missing=" " /> reads as null
    [undefined, null, 'unknown'],
  ])('parses %o as %o (%s)', (raw, value, kind) => {
    expect(parseTeneur(raw)).toEqual({ value, kind })
  })

  it('throws on a value it cannot account for, rather than guessing', () => {
    // A silent 0 here would publish a wrong macro; a silent drop would hide an
    // upstream format change. Both are worse than failing the build.
    expect(() => parseTeneur('about 12')).toThrow(/Unparseable/)
    expect(() => parseTeneur('12,3,4')).toThrow(/Unparseable/)
  })

  it('throws on a negative macro, which means a corrupt file not a data gap', () => {
    expect(() => parseTeneur('-3,2')).toThrow(/Negative/)
  })
})

describe('parseCofidValue', () => {
  it.each([
    ['12.4', 12.4, 'number'],
    ['0', 0, 'number'],
    ['Tr', 0, 'trace'], // CoFID's documented trace marker
    ['tr', 0, 'trace'],
    ['N', null, 'unknown'], // present but no reliable amount
    ['', null, 'unknown'],
    [null, null, 'unknown'],
  ])('parses %o as %o (%s)', (raw, value, kind) => {
    expect(parseCofidValue(raw)).toEqual({ value, kind })
  })

  it('does not read a comma as a decimal separator', () => {
    // CoFID writes decimal points; "1,234" would be a thousands separator, and
    // silently reading it as 1.234 would be a 1000x error.
    expect(() => parseCofidValue('1,234')).toThrow(/Unparseable/)
  })
})

describe('parseCreaValue', () => {
  it.each([
    ['49.7', 49.7, 'number'],
    ['5,1', 5.1, 'number'],
    ['tracce', 0, 'trace'],
    ['', null, 'unknown'],
  ])('parses %o as %o (%s)', (raw, value, kind) => {
    expect(parseCreaValue(raw)).toEqual({ value, kind })
  })
})

// ---------------------------------------------------------------------------
// XML reading
// ---------------------------------------------------------------------------

describe('xmlField', () => {
  const rec = `
    <alim_code> 1000 </alim_code>
    <alim_nom_fr> Pastis </alim_nom_fr>
    <alim_nom_sci missing=" " />
  `
  it('trims the padding Ciqual writes around every value', () => {
    expect(xmlField(rec, 'alim_code')).toBe('1000')
    expect(xmlField(rec, 'alim_nom_fr')).toBe('Pastis')
  })

  it('reads a self-closing missing element as null, not as the string "missing"', () => {
    expect(xmlField(rec, 'alim_nom_sci')).toBeNull()
  })

  it('reads an absent element as null', () => {
    expect(xmlField(rec, 'nope')).toBeNull()
  })

  it('decodes entities', () => {
    expect(xmlField(`<n> Jones&apos; factor </n>`, 'n')).toBe("Jones' factor")
    expect(decodeXml('a &amp; b &#233;')).toBe('a & b é')
  })
})

describe('xmlRecords', () => {
  it('splits a table into records', () => {
    expect(xmlRecords('<T><A><x>1</x></A><A><x>2</x></A></T>', 'A')).toEqual([
      '<x>1</x>',
      '<x>2</x>',
    ])
  })
})

// ---------------------------------------------------------------------------
// Ciqual constituent resolution — the guard against a silently shifted column.
// ---------------------------------------------------------------------------

const CONST_XML = `<TABLE>
  <CONST><const_code> 327 </const_code><const_nom_eng> Energy, Regulation EU No 1169/2011 (kJ/100g) </const_nom_eng><code_INFOODS> ENERC </code_INFOODS></CONST>
  <CONST><const_code> 328 </const_code><const_nom_eng> Energy, Regulation EU No 1169/2011 (kcal/100g) </const_nom_eng><code_INFOODS> ENERC </code_INFOODS></CONST>
  <CONST><const_code> 25000 </const_code><const_nom_eng> Protein (g/100g) </const_nom_eng><code_INFOODS> PROCNT </code_INFOODS></CONST>
  <CONST><const_code> 25003 </const_code><const_nom_eng> Protein, crude, N x 6.25 (g/100g) </const_nom_eng><code_INFOODS> PROCNT </code_INFOODS></CONST>
  <CONST><const_code> 31000 </const_code><const_nom_eng> Carbohydrate (g/100g) </const_nom_eng><code_INFOODS> CHOAVL </code_INFOODS></CONST>
  <CONST><const_code> 40000 </const_code><const_nom_eng> Fat (g/100g) </const_nom_eng><code_INFOODS> FAT </code_INFOODS></CONST>
</TABLE>`

describe('resolveConstCodes', () => {
  it('disambiguates the two PROCNT constituents to N x 6.25', () => {
    // Ciqual ships both "Protein" (Jones factor) and "Protein, crude, N x 6.25".
    // 6.25 is the EU 1169/2011 labelling basis — what a package label shows.
    expect(resolveConstCodes(CONST_XML)).toEqual({
      carbs_g: '31000',
      protein_g: '25003',
      fats_g: '40000',
      kcal: '328', // kcal, not the kJ variant sharing the ENERC tag
    })
  })

  it('throws with the candidates when a constituent is renamed upstream', () => {
    const renamed = CONST_XML.replace('Carbohydrate (g/100g)', 'Available carbohydrate (g/100g)')
    expect(() => resolveConstCodes(renamed)).toThrow(/carbs_g.*resolved to 0 rows/s)
  })

  it('throws when a name pattern becomes ambiguous', () => {
    const dup = CONST_XML.replace(
      '</TABLE>',
      '<CONST><const_code> 40001 </const_code><const_nom_eng> Fat, total (g/100g) </const_nom_eng><code_INFOODS> FAT </code_INFOODS></CONST></TABLE>',
    )
    expect(() => resolveConstCodes(dup)).toThrow(/fats_g.*resolved to 2 rows/s)
  })

  it('throws on an empty constituent table rather than yielding no codes', () => {
    expect(() => resolveConstCodes('<TABLE></TABLE>')).toThrow(/no <CONST> records/)
  })

  it('names every column the importer writes', () => {
    expect(Object.keys(CIQUAL_CONSTITUENTS).sort()).toEqual(
      ['carbs_g', 'fats_g', 'kcal', 'protein_g'].sort(),
    )
  })
})

describe('parseCiqualGroups', () => {
  it('joins the French and English group labels for use as synonyms', () => {
    const xml = `<TABLE><ALIM_GRP>
      <alim_grp_code> 06 </alim_grp_code>
      <alim_grp_nom_fr> eaux et autres boissons </alim_grp_nom_fr>
      <alim_grp_nom_eng> beverages </alim_grp_nom_eng>
    </ALIM_GRP></TABLE>`
    expect(parseCiqualGroups(xml)).toEqual({ '06': 'eaux et autres boissons beverages' })
  })
})

// ---------------------------------------------------------------------------
// Ciqual end to end
// ---------------------------------------------------------------------------

const ALIM_XML = `<TABLE>
  <ALIM><alim_code> 1000 </alim_code><alim_nom_fr> Pastis </alim_nom_fr><alim_nom_eng> Pastis </alim_nom_eng><alim_nom_sci missing=" " /><alim_grp_code> 06 </alim_grp_code></ALIM>
  <ALIM><alim_code> 2000 </alim_code><alim_nom_fr> Jus incomplet </alim_nom_fr><alim_nom_eng> Incomplete juice </alim_nom_eng><alim_nom_sci missing=" " /><alim_grp_code> 06 </alim_grp_code></ALIM>
</TABLE>`

const GRP_XML = `<TABLE><ALIM_GRP><alim_grp_code> 06 </alim_grp_code><alim_grp_nom_fr> boissons </alim_grp_nom_fr><alim_grp_nom_eng> beverages </alim_grp_nom_eng></ALIM_GRP></TABLE>`

const compo = (alim, cst, teneur) =>
  `<COMPO><alim_code> ${alim} </alim_code><const_code> ${cst} </const_code>${teneur}</COMPO>`

describe('parseCiqual', () => {
  const COMPO_XML = `<TABLE>
    ${compo(1000, 31000, '<teneur> 2,86 </teneur>')}
    ${compo(1000, 25003, '<teneur> 0 </teneur>')}
    ${compo(1000, 40000, '<teneur> traces </teneur>')}
    ${compo(1000, 328, '<teneur> 274 </teneur>')}
    ${compo(1000, 999, '<teneur> 12,3 </teneur>')}
    ${compo(2000, 31000, '<teneur> 10,1 </teneur>')}
    ${compo(2000, 25003, '<teneur> 0,4 </teneur>')}
    ${compo(2000, 40000, '<teneur missing=" " />')}
  </TABLE>`

  const result = parseCiqual({
    alimXml: ALIM_XML,
    compoXml: COMPO_XML,
    constXml: CONST_XML,
    grpXml: GRP_XML,
    version: 'ciqual-test',
  })

  it('maps a complete food onto the 100 g row shape', () => {
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({
      source: 'ciqual',
      external_id: '1000',
      name: 'Pastis',
      name_lang: 'fr',
      name_en: 'Pastis',
      synonyms: 'boissons beverages',
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 2.86,
      protein_g: 0,
      fats_g: 0, // "traces" becomes a real zero
      kcal: 274,
      dataset_version: 'ciqual-test',
    })
  })

  it('drops a food with an undetermined macro instead of publishing it as zero', () => {
    expect(result.rows.map((r) => r.external_id)).not.toContain('2000')
    expect(result.dropped).toEqual([
      { external_id: '2000', name: 'Jus incomplet', reason: 'no fats_g' },
    ])
  })

  it('ignores the 70 constituents it was not asked for', () => {
    expect(result.rows[0]).not.toHaveProperty('999')
  })
})

describe('parseCiqual macro-sum tripwire', () => {
  it('flags a food whose macros exceed 100 g, the signature of a mis-mapped column', () => {
    const COMPO_XML = `<TABLE>
      ${compo(1000, 31000, '<teneur> 60 </teneur>')}
      ${compo(1000, 25003, '<teneur> 30 </teneur>')}
      ${compo(1000, 40000, '<teneur> 274 </teneur>')}
    </TABLE>`
    const r = parseCiqual({
      alimXml: ALIM_XML,
      compoXml: COMPO_XML,
      constXml: CONST_XML,
      grpXml: GRP_XML,
      version: 'v',
    })
    // Still shipped — the tripwire reports, it does not silently discard.
    expect(r.rows).toHaveLength(1)
    expect(r.outliers).toEqual([{ external_id: '1000', name: 'Pastis', sum: 364 }])
  })
})

// ---------------------------------------------------------------------------
// CoFID
// ---------------------------------------------------------------------------

// Headings really do span three rows in the published workbook.
const COFID_HEADERS = [
  ['', '', '', '', 'Proximates', '', ''],
  ['Food Code', 'Food Name', 'Description', 'Group', 'Protein (g)', 'Fat (g)', 'Carbohydrate (g)'],
  ['', '', '', '', 'PROT', 'FAT', 'CHO'],
]

describe('cofidColumns', () => {
  it('finds the columns wherever they sit in the three header rows', () => {
    expect(cofidColumns(COFID_HEADERS)).toMatchObject({
      id: 0,
      name: 1,
      desc: 2,
      group: 3,
      protein_g: 4,
      fats_g: 5,
      carbs_g: 6,
    })
  })

  it('falls back to the nutrient tag row when the prose heading is reworded', () => {
    // Row 2 carries "Fat (g)" and row 3 the INFOODS-style tag "FAT". Losing one
    // should not lose the column.
    const reworded = COFID_HEADERS.map((r) => r.map((c) => (c === 'Fat (g)' ? 'Lipids' : c)))
    expect(cofidColumns(reworded).fats_g).toBe(5)
  })

  it('throws rather than guessing when a required column is gone from every header row', () => {
    const broken = COFID_HEADERS.map((r) =>
      r.map((c) => (c === 'Fat (g)' || c === 'FAT' ? 'Lipids' : c)),
    )
    expect(() => cofidColumns(broken)).toThrow(/missing required columns: fats_g/)
  })
})

describe('parseCofid', () => {
  const result = parseCofid({
    headerRows: COFID_HEADERS,
    dataRows: [
      ['11-100', 'Bread, wholemeal', 'Average sample', 'AB', '9.4', '2.5', '42.0'],
      ['17-200', 'Beer, bitter', 'Draught', 'Q', '0.3', 'Tr', '2.3'],
      ['99-999', 'Mystery item', '', 'AB', 'N', '1.0', '2.0'],
      ['', '', '', '', '', '', ''],
    ],
    version: 'cofid-test',
  })

  it('reads a normal food as per 100 g', () => {
    expect(result.rows[0]).toMatchObject({
      source: 'cofid',
      external_id: '11-100',
      name: 'Bread, wholemeal',
      name_lang: 'en',
      name_en: '',
      synonyms: 'Average sample AB',
      serving_amount: 100,
      serving_unit: 'g',
      protein_g: 9.4,
      fats_g: 2.5,
      carbs_g: 42,
    })
  })

  it('marks alcoholic beverages (group Q) as per 100 ml, never restating volume as mass', () => {
    const beer = result.rows.find((r) => r.external_id === '17-200')
    expect(beer.serving_unit).toBe('ml')
    expect(beer.fats_g).toBe(0) // Tr
  })

  it('drops a food whose macro is "N" (present, amount unknown)', () => {
    expect(result.dropped).toEqual([
      { external_id: '99-999', name: 'Mystery item', reason: 'no protein_g' },
    ])
  })

  it('skips blank rows without counting them as drops', () => {
    expect(result.rows).toHaveLength(2)
    expect(result.dropped).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// CREA
// ---------------------------------------------------------------------------

const CREA_HTML = `
<table>
<tr class="riga nutriente"><td width="250">Acqua (g)</td><td>g</td><td>34.3&nbsp;</td></tr>
<tr class="riga nutriente"><td width="250">Energia (kcal)</td><td>kcal</td><td>275&nbsp;</td></tr>
<tr class="riga nutriente"><td width="250">Proteine (g)</td><td>g (N x 6,25)</td><td>10.1&nbsp;</td></tr>
<tr class="riga nutriente"><td width="250">Lipidi (g)</td><td>g</td><td>5.1&nbsp;</td></tr>
<tr class="riga nutriente"><td width="250">Carboidrati disponibili (g)</td><td>g</td><td>49.7&nbsp;</td></tr>
<tr class="riga nutriente"><td width="250">Amido (g)</td><td>g</td><td>16.8&nbsp;</td></tr>
</table>`

describe('parseCreaDetail', () => {
  it('picks the four nutrients it needs out of the detail table', () => {
    expect(parseCreaDetail(CREA_HTML)).toEqual({
      kcal: { value: 275, kind: 'number' },
      protein_g: { value: 10.1, kind: 'number' },
      fats_g: { value: 5.1, kind: 'number' },
      carbs_g: { value: 49.7, kind: 'number' },
    })
  })

  it('does not confuse "Carboidrati disponibili" with another carbohydrate row', () => {
    // "Amido" (starch) sits directly below it and is also a carbohydrate.
    const v = parseCreaDetail(CREA_HTML)
    expect(v.carbs_g.value).toBe(49.7)
    expect(v.carbs_g.value).not.toBe(16.8)
  })

  it('returns nothing for a page whose table is missing', () => {
    expect(parseCreaDetail('<html><body>404</body></html>')).toEqual({})
  })
})

describe('parseCrea', () => {
  it('joins the category listing to the detail pages', () => {
    const r = parseCrea({
      foods: [
        { id: 'PC0045', name: 'Pan di Spagna', category: 'Prodotti da forno' },
        { id: 'ZZ0000', name: 'Mai scaricato', category: 'X' },
      ],
      details: new Map([['PC0045', CREA_HTML]]),
      version: 'crea-test',
    })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      source: 'crea',
      external_id: 'PC0045',
      name: 'Pan di Spagna',
      name_lang: 'it',
      synonyms: 'Prodotti da forno',
      carbs_g: 49.7,
      protein_g: 10.1,
      fats_g: 5.1,
      kcal: 275,
    })
    expect(r.warnings).toEqual([expect.stringContaining('ZZ0000')])
  })
})

// ---------------------------------------------------------------------------
// CSV round trip — the committed files are the source of truth for the DB.
// ---------------------------------------------------------------------------

describe('toCsv / fromCsv', () => {
  const rows = [
    {
      source: 'ciqual',
      external_id: '1000',
      name: 'Boeuf, "faux-filet", cru',
      name_lang: 'fr',
      name_en: 'Beef, sirloin, raw',
      synonyms: 'viandes\nmeat',
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 0,
      protein_g: 21.2,
      fats_g: 5.1,
      kcal: '',
      dataset_version: 'v1',
    },
  ]

  it('round-trips quotes, commas and newlines', () => {
    const back = fromCsv(toCsv(rows))
    expect(back).toHaveLength(1)
    expect(back[0].name).toBe('Boeuf, "faux-filet", cru')
    expect(back[0].synonyms).toBe('viandes\nmeat')
  })

  it('writes a header naming every column', () => {
    expect(toCsv(rows).split('\n')[0]).toBe(
      'source,external_id,name,name_lang,name_en,synonyms,serving_amount,serving_unit,carbs_g,protein_g,fats_g,kcal,dataset_version',
    )
  })

  it('ignores a trailing newline rather than emitting a blank row', () => {
    expect(fromCsv(toCsv(rows))).toHaveLength(1)
  })
})

describe('toDbRow', () => {
  it('restores numbers and turns empty strings back into nulls', () => {
    const [row] = fromCsv(
      toCsv([
        {
          source: 'cofid',
          external_id: '11-100',
          name: 'Bread',
          name_lang: 'en',
          name_en: '',
          synonyms: '',
          serving_amount: 100,
          serving_unit: 'g',
          carbs_g: 42,
          protein_g: 9.4,
          fats_g: 2.5,
          kcal: '',
          dataset_version: 'cofid-2021',
        },
      ]),
    )
    expect(toDbRow(row)).toEqual({
      source: 'cofid',
      external_id: '11-100',
      name: 'Bread',
      name_lang: 'en',
      name_en: null,
      synonyms: null,
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 42,
      protein_g: 9.4,
      fats_g: 2.5,
      kcal: null,
      dataset_version: 'cofid-2021',
    })
  })
})

// ---------------------------------------------------------------------------
// Duplicate ids — (source, external_id) is the primary key, so these cannot
// reach the database. CoFID 2021 really does ship one.
// ---------------------------------------------------------------------------

describe('duplicate external_id handling', () => {
  it('keeps the first occurrence and names the food it dropped', () => {
    const result = parseCofid({
      headerRows: COFID_HEADERS,
      dataRows: [
        ['13-669', 'Aubergine, roasted', '', 'DG', '2.1', '3.8', '5.2'],
        ['13-669', 'Watercress, raw', '', 'DG', '1.9', '0.3', '0.0'],
      ],
      version: 'v',
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Aubergine, roasted')
    expect(result.warnings).toEqual([
      'duplicate external_id 13-669: kept "Aubergine, roasted", dropped "Watercress, raw"',
    ])
  })
})
