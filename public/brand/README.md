# Mora logo

## The idea

Three shapes on a 14 × 12 grid: the sender's rail (top left), the payment held
(the square), the recipient's rail (bottom right). It is what Mora does: a
payment held between two people until one of them takes it.

The mark is the same when rotated 180°. A payment can always go back.

The wordmark is "mora", lowercase, in Hedvig Letters Sans (the site's text
face), converted to outlines so it never depends on an installed font.

## Files

| File | Use |
|---|---|
| `mora-logo-color.svg` | Lockup, colour, on light backgrounds |
| `mora-logo-color-dark.svg` | Lockup, colour, on dark backgrounds |
| `mora-logo.svg` | Lockup, one colour (`currentColor`): set the text colour to recolour |
| `mora-mark-color.svg` / `-dark.svg` | Mark alone, colour |
| `mora-mark.svg` | Mark alone, one colour (`currentColor`) |
| `mora-wordmark.svg` | Wordmark alone, `currentColor` |
| `mora-app-icon.svg` (+ 512, 192 PNG) | App and social avatar: ink tile |
| `mora-logo-color*.png`, `mora-mark-color-512.png` | Raster copies for forms and slides |
| `../../src/app/icon.svg` | Favicon: 16 px grid, follows light/dark |
| `../../src/app/apple-icon.png` | Apple touch icon, 180 px |

## Colour

| | Light | Dark |
|---|---|---|
| Rails, wordmark | Ink `#121212` | Paper `#fafafa` |
| Held payment | Waiting `#884c07` | Waiting `#f5b13d` |

The only colour is the product's own "Waiting" status colour (the payment that
waits), consistent with the interface, which has no brand colour of its own.
Inside the product chrome (the site header) the logo is one colour.

## Rules

- **Clear space:** at least the height of the square (half the mark's height)
  on every side.
- **Minimum size:** mark 12 px tall; lockup 16 px tall. Below that, use the mark
  alone.
- **Pixel grid:** draw the mark at whole multiples of its grid (14 × 12 at 28 ×
  24, 42 × 36…) or use the 16 px favicon file, so edges stay sharp.
- **Don't** add gradients, outlines, shadows or rounded corners; rotate the mark
  other than 180°; recolour the square to anything but the Waiting colour or
  the one-colour version; or stretch the lockup.
