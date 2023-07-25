#!/usr/bin/dyalogscript

⍝ Parsing articles
'htx'⎕CY'dfns'
topics urls titles dates authors ← ↓⍉↑('(class|href)="(.*?)"'⎕S{⊃⌽'"'(≠⊆⊢)⍵.Match},'a'∘htx,((', '(⊢⊆⍨⌽⍤⍷⍥⌽=⍷)⊃)'span'∘htx))¨'<div>'htx⊃⎕NGET'index.html'

⍝ Archiving
_Delay ← {r←⍺⍺ ⍵ ⋄ _←⎕DL 12.5 ⋄ r}
GetArchives ← {⎕JSON⊃⎕SH'curl -s http://archive.org/wayback/available?url=',⍵}_Delay¨
archives ← GetArchives urls
mask ← ('{}'∘⍷ (∨∊⍥⍸⊣) '"closest"'∘⍷)⎕JSON archives.archived_snapshots
{⎕SH 'curl -Ls -o /dev/null https://web.archive.org/save/',⍵}_Delay¨ mask/urls
archives ← GetArchives urls
'archives.apla' 1 ⎕NPUT⍨⊂ ⎕SE.Dyalog.Array.Serialise archives.archived_snapshots.closest.url

⍝ Generating RSS feed
2⎕FIX'file://rss.aplf'
'rss.xml' 1 ⎕NPUT⍨ Rss ⍉↑topics urls titles dates authors