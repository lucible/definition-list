---
frontmatter: test
---
multiple terms
are not supported
: it will always use the single line closest to the definition as the term.

Paragraphs between definitions are left alone and not accidentally interpreted as a term.

this is a definition term
: this is a definition

2024-07-17 01:57:06 PM
: Today's kombucha is "Hopped Blueberry"?? which is way less tasty than the blueberry mango. maybe a 3/5. Nah, the more I drink it the grosser it gets. 2/5. Been avoiding the other flavor (pineapple hibiscus) because I usually like the berry flavors more, but maybe it'd be better than this. We'll see what flavors are still around on Friday!

This is an example term
: this is the first definition

: this is a definition on a new line. these will render as regular paragraphs, not definitions, in live preview or reading mode.

this is a term
  : with an indented definition... and it's a very very long definition so you know it's gonna breaaaaak yeah yeah yeah lots and lots of text maaann. wah. and WOOOOO HOOO this seems to work.
  : Let's add another definition.
  : and a third definition at last at last.

_Italic Term_
  : with an indented definition asdflkj
  : and another indented definition and _italic_ and **bold** and ==highlight== and [link](https://example.com)

`Code Term`
  ~ with a tilde for the definition marker and `inline code` and ~~strikethrough~~
  ~ another definition and _italic_ and **bold** and ==highlight== and [link](https://example.com)

[This is a linked term](https://example.com)
: This is a definition for the linked term.

> > Super nested
> > : definition?
> 
> nested
> : definition

```
Term
: definition
: another definition
```

### Invalid Definitions
: definition rendering is not valid

- this is a list
: definition rendering is not valid

0. this is a list
: definition rendering is not valid

![test|200](https://picsum.photos/200/100)
: definition rendering is not valid

---
: definition rendering is not valid

***
: definition rendering is not valid

___
: definition rendering is not valid[^1]

[^1]: this is a footnote
: definition rendering is not valid

| test         | table        |
| ------------ | ------------ |
| a table line | another word |
: definition rendering is not valid

$$
math
$$
: definition rendering is not valid

^block-id
: definition rendering is not valid


