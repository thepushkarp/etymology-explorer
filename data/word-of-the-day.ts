export interface WordOfTheDayEntry {
  word: string
  date: string // "January 1"
  teaser: string
}

export const wordOfTheDayList: WordOfTheDayEntry[] = [
  {
    word: 'algorithm',
    date: 'January 1',
    teaser: 'Named after a 9th-century Persian mathematician',
  },
  {
    word: 'berserk',
    date: 'January 2',
    teaser: 'From Old Norse "berserkr" — warrior who fought in a trance',
  },
  { word: 'quarantine', date: 'January 3', teaser: 'From Italian "quaranta giorni" — forty days' },
  { word: 'disaster', date: 'January 4', teaser: 'Greek "dis-aster" — literally "bad star"' },
  { word: 'muscle', date: 'January 5', teaser: 'Latin "musculus" — literally "little mouse"' },
  {
    word: 'salary',
    date: 'January 6',
    teaser: 'From Latin "sal" — Roman soldiers were paid in salt',
  },
  {
    word: 'candidate',
    date: 'January 7',
    teaser: 'From Latin "candidatus" — they wore white togas',
  },
  { word: 'nice', date: 'January 8', teaser: 'Surprisingly, it once meant "foolish"' },
  { word: 'villain', date: 'January 9', teaser: 'Originally just meant "farm worker"' },
  {
    word: 'amateur',
    date: 'January 10',
    teaser: 'Latin "amator" — one who does something for love',
  },
  {
    word: ' assassin',
    date: 'January 11',
    teaser: 'From Arabic "hashish" — the original hash-eaters',
  },
  { word: 'heretic', date: 'January 12', teaser: 'Greek "hairetikos" — one who chooses' },
  { word: 'clue', date: 'January 13', teaser: 'Originally "clew" — a ball of yarn' },
  { word: 'robot', date: 'January 14', teaser: 'Czech "robota" — forced labor' },
  {
    word: 'nightmare',
    date: 'January 15',
    teaser: 'Old English "maere" — a spirit that suffocates sleepers',
  },
  { word: 'companion', date: 'January 16', teaser: 'Latin "com-" + "panis" — sharing bread' },
  { word: 'portrait', date: 'January 17', teaser: 'French "portrait" — literally "drawn forth"' },
  {
    word: 'silhouette',
    date: 'January 18',
    teaser: 'Named after French finance minister Étienne de Silhouette',
  },
  { word: 'sandal', date: 'January 19', teaser: 'Greek "sandalon" — from Persian' },
  { word: 'hazard', date: 'January 20', teaser: 'Arabic "al-zahr" — the die (gambling)' },
  { word: 'paradise', date: 'January 21', teaser: 'Persian "pairi-daeza" — walled enclosure' },
  { word: 'cherry', date: 'January 22', teaser: 'From Greek "kerasos" via Latin "cerasus"' },
  { word: 'ketchup', date: 'January 23', teaser: 'Malay "kicap" — fish sauce' },
  { word: 'orient', date: 'January 24', teaser: 'Latin "oriri" — to rise (where the sun rises)' },
  { word: 'sophomore', date: 'January 25', teaser: 'Greek "sophos" + "moros" — wise fool' },
  {
    word: 'dunce',
    date: 'January 26',
    teaser: 'From John Duns Scotus — his ideas were later considered foolish',
  },
  { word: 'tragedy', date: 'January 27', teaser: 'Greek "tragōidia" — "goat song"' },
  { word: 'coffee', date: 'January 28', teaser: 'Arabic "qahwa" — the drink' },
  { word: 'diameter', date: 'January 29', teaser: 'Greek "dia-" + "metron" — measure across' },
  { word: 'jeans', date: 'January 30', teaser: 'From "Genes" — Genoa, Italy' },
  { word: 'diesel', date: 'January 31', teaser: 'Named after Rudolf Diesel, the inventor' },
  // February
  { word: 'february', date: 'February 1', teaser: 'Latin "februum" — cleansing ritual' },
  { word: 'valentine', date: 'February 2', teaser: 'From Saint Valentine — multiple martyred' },
  { word: 'carnival', date: 'February 3', teaser: 'Latin "carne vale" — farewell to meat' },
  { word: 'acronym', date: 'February 4', teaser: 'Greek "akros" + "onoma" — name from end' },
  { word: 'boycott', date: 'February 5', teaser: 'Named after Captain Charles Boycott' },
  { word: 'pagan', date: 'February 6', teaser: 'Latin "paganus" — country dweller' },
  { word: 'grotesque', date: 'February 7', teaser: 'Italian "grottesco" — like a cave painting' },
  { word: ' souvenir', date: 'February 8', teaser: 'French "souvenir" — to remember' },
  { word: 'burger', date: 'February 9', teaser: 'Short for "Hamburger" — from Hamburg, Germany' },
  { word: 'jazz', date: 'February 10', teaser: 'Possibly from "jasm" — energy, vigor' },
  { word: 'pandemic', date: 'February 11', teaser: 'Greek "pan" + "demos" — all the people' },
  { word: 'karma', date: 'February 12', teaser: 'Sanskrit "karman" — action, deed' },
  { word: 'tycoon', date: 'February 13', teaser: 'Japanese "taikun" — great lord' },
  { word: 'influenza', date: 'February 14', teaser: 'Italian "influence" — of the stars' },
  { word: 'emoji', date: 'February 15', teaser: 'Japanese "e" + "moji" — picture character' },
  { word: 'hazard', date: 'February 16', teaser: 'Arabic "al-zahr" — the die (gambling)' },
  { word: 'orchestra', date: 'February 17', teaser: 'Greek "orchestra" — dancing place' },
  { word: 'hammock', date: 'February 18', teaser: 'Spanish "hamaca" — from Taino' },
  { word: 'safari', date: 'February 19', teaser: 'Swahili "safari" — journey' },
  { word: 'tofu', date: 'February 20', teaser: 'Japanese "tōfu" — curdled bean milk' },
  { word: 'alcove', date: 'February 21', teaser: 'Arabic "al-qubba" — vault' },
  { word: 'sofa', date: 'February 22', teaser: 'Arabic "suffa" — bench' },
  { word: 'candy', date: 'February 23', teaser: 'Sanskrit "khanda" — sugar' },
  { word: 'apricot', date: 'February 24', teaser: 'Arabic "al-barqūq" — the fruit' },
  { word: 'magazine', date: 'February 25', teaser: 'Arabic "makhazin" — storehouses' },
  { word: 'monster', date: 'February 26', teaser: 'Latin "monstrum" — divine omen' },
  { word: 'pirate', date: 'February 27', teaser: 'Greek "peira" — to attempt, attack' },
  { word: 'quiz', date: 'February 28', teaser: 'Unknown origin — possibly student slang' },
]

/**
 * Get today's word of the day based on the current date
 */
export function getWordOfTheDay(): WordOfTheDayEntry {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 60 * 60 * 24 * 1000
  const dayOfYear = Math.floor(diff / oneDay)

  return wordOfTheDayList[dayOfYear % wordOfTheDayList.length]
}
