# The Jot Dot Times

Supports lynx, w3m, eww, and mothra

## To-do

- [X] RSS feed
- [ ] Accessible scaling
- [ ] Backup articles on archive.org

## Parsing articles

```
'htx'⎕CY'dfns'⋄↑('(class|href)="(.*?)"'⎕S{⊃⌽'"'(≠⊆⊢)⍵.Match},'a'∘htx,((', '(⊢⊆⍨⌽⍤⍷⍥⌽=⍷)⊃)'span'∘htx))¨'<div>'htx⊃⎕NGET'index.html'
```

This erroneous one-liner returns a matrix with columns: `Topic | URL | Title | Date | Author`