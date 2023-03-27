# The Jot Dot Times

Supports lynx, w3m, eww, and mothra

## To-do

- [ ] RSS feed
- [ ] Accessible scaling
- [ ] Backup articles on archive.org

## Parsing articles

```
⍝   separate date and author    remove left-over tags   split on attr="value"   remove surrounding blanks   separate tags                               separate articles
↑{⊃,/⊆¨{(~0@1≠', '⍳⍵)⊆⍵}¨@(1↑⍨∘-≢)'/a' 'span' '/span' ~⍨ {⊃⌽'"'(≠⊆⊢)⍵}¨@1 2 {⍵/⍨~(∧/∊∘(⎕json '"\n "'))¨⍵} {⍵⊆⍨~⍵∊'<>'} ⍵}¨'<div id="article"' '</div>'{⍵⊆⍨(≠\∨⊢)⍺(⊃∨.⍷)⊂⍵}⊃⎕NGET'index.html'
```

This erroneous one-liner returns a matrix with columns: `Topic | URL | Title | Date | Author`