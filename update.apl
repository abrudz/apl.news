#!/usr/bin/dyalogscript

'htx'⎕CY'dfns'
topics urls titles dates authors ← ↓⍉↑('(class|href)="(.*?)"'⎕S{⊃⌽'"'(≠⊆⊢)⍵.Match},'a'∘htx,((', '(⊢⊆⍨⌽⍤⍷⍥⌽=⍷)⊃)'span'∘htx))¨'<div>'htx⊃⎕NGET'index.html'

Fetch ← {(⎕SE.SALT.New 'HttpCommand' ('GET' ⍵)).Run.Data}
_Delay ← {{⍵⍨⎕DL 12.5}⍺⍺ ⍵}
IsArchived ← {~∨/'{}'⍷Fetch 'http://archive.org/wayback/available?url=',⍵}_Delay

_On ← {⍺⍺¨⍣(~0∊⍴⍵)⊢⍵}

{Fetch 'https://web.archive.org/save/',⍵}_Delay _On (~IsArchived¨urls) / urls

GetArchive ← {⎕JSON Fetch 'http://archive.org/wayback/available?url=',⍵}_Delay

archives ← GetArchive¨ urls
'archives.apla' 1 ⎕NPUT⍨⊂ ⎕SE.Dyalog.Array.Serialise archives.archived_snapshots.closest.url

2⎕FIX'file://rss.aplf'
'rss.xml' 1 ⎕NPUT⍨ Rss ⍉↑topics urls titles dates authors
