# Font licences

Self-hosted subsets (Basic Latin plus common punctuation and arrows, woff2, variable weight axis) of the Fontsource packages below. Licence text is as stated in each package. Each file below was cut from its package's woff2 with fontTools; the licence travels with the font.

- bricolage-grotesque-latin-wght-wdth82-normal.woff2: from bricolage-grotesque-latin-wdth-normal.woff2 (wght and wdth axes), width pinned at 82% with fontTools varLib.instancer (weight stays variable), then subset to the 108 shipped code points. 26,396 bytes.
- newsreader-latin-wght-normal.woff2: wght axis, Basic Latin subset. 36,476 bytes.
- newsreader-thesis-wght-italic.woff2: from newsreader-latin-wght-italic.woff2, subset with fontTools pyftsubset to the 24 characters of the hero thesis line. 10,412 bytes.
- martian-mono-latin-wght-normal.woff2: wght axis, Basic Latin subset. 14,424 bytes.

## bricolage-grotesque

- Package: @fontsource-variable/bricolage-grotesque 5.3.0
- License (package.json): OFL-1.1
- Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)
- This Font Software is licensed under the SIL Open Font License, Version 1.1.

## martian-mono

- Package: @fontsource-variable/martian-mono 5.3.0
- License (package.json): OFL-1.1
- Copyright 2020 The Martian Mono Project Authors (https://github.com/evilmartians/mono)
- This Font Software is licensed under the SIL Open Font License, Version 1.1.

## newsreader

- Package: @fontsource-variable/newsreader 5.3.0
- License (package.json): OFL-1.1
- Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader) Newsreader-Italic[opsz,wght].ttf: Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader)
- This Font Software is licensed under the SIL Open Font License, Version 1.1.


## Social card fonts (build time only)

The generated 1200x630 social images are rendered at build by satori, which reads woff but not woff2. They use the static woff files from the packages below, read from node_modules at build and never shipped to visitors. All are OFL-1.1 with the same copyright holders as the families above.

- @fontsource/bricolage-grotesque 5.3.0 (weight 800)
- @fontsource/newsreader 5.3.0 (weight 400)
- @fontsource/martian-mono 5.3.0 (weight 400)
