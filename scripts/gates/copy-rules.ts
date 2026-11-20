// Copy rules for the built site. Employer names are stored as SHA-256 digests
// of the lowercase term so the public repo never carries the list in plaintext.
// The scanner hashes 1-, 2- and 3-word n-grams of the visible text and compares.
export const EMPLOYER_DIGESTS: string[] = [
  '5a311167ef7ba15cc697086a98c31fe06cf757d305865657678fe85ae1eacaaa',
  'f3ba961609501b26faafcdd97aeae573ce88b6a1122dfaba67ce06f2eca3d31d',
  '8a3e8c7e48bf5cee805c312f6b62ee4ce77c1042c708ed1e6fec571492ae34a6',
  'f85b805016712c5924ca932603b1858fc206f415f533611b4d347f074eb07063',
  '7a2ac772a42532e793aba4c19a9d3c6a02a4b7539511c438583836eaddc3fafb',
  '24b0cf073750bb7d26defae5d5a1e10602a0edc3720aab6c941912842f693210',
  '0ffad2f3fe48e70fc3e846acc08e6f58f73e554f38db47bca364f2b4e3fb7e55',
  '4e5ad6edbdbf720d8ea9c3e04890b06d57fce2d806829ae68e942949faf50472',
  'cb5c36fe59056a6a1afb4b133d30981f672257d6c372bace38798b504fc0c6f2',
  'c376013522845bfce25461e2335a75a6808fd9365beba1c8ad75200ff2488ea3',
  '7de355f411617866ac535b498fc7b2b1fe58d0f028146dd8276a4ef146bf3ad6',
  '12ee4fc7c3ee2e4ddbebc1f9322f5a9e00961f5e441557d159f4b5dc4f51f539',
  '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
]

// One-word product names that run an employer term into another word with no space or case
// break, so neither the n-gram scan nor the case split can see the term inside them. Same
// hashing as above (the lowercase token).
export const COMPOUND_DIGESTS: string[] = ['0f9ba39125320fe733f4000f834520d5d4bb5ead805eed864fc6f12f6bf93955']

export const HEDGES: string[] = [
  'unconfirmed',
  'draft',
  'pending',
  'pending approval',
  'illustrative',
  'not a measure',
]
