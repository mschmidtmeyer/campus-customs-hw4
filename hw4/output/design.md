# Campus Customs — Design (Problem 10)

What changed in the look and feel, and why it makes a shopper stay and buy.

## 1. The site follows the seasons on campus
- **What:** The home hero shows a real Yale campus photo for the current season in New Haven.
  - Winter: Hopper College courtyard in snow.
  - Spring: Saybrook's Killingworth Court in bloom.
  - Summer: Harkness Tower from Old Campus.
  - Fall: Cross Campus.
  - Today shows fall. A season switcher (marked "Now") previews the other seasons, with a "Back to today" pill.
- **Color:** Accent colors follow the season: icy blue, blossom pink, warm gold, maple orange.
- **Fallback:** An original animated illustration of the campus (Harkness Tower, Gothic gate, elms) shows if a photo can't load.
- **Why it sells:** The site feels alive and local on every visit, and shoppers see the place they love before they see a price.

## 2. "In season now" picks
- **What:** A scrolling row of up to 8 in-stock items chosen for the season:
  - winter: fleece, bomber and full-zip
  - spring: quarter-zips and crewnecks
  - summer: tees and performance shirts
  - fall: crewnecks, hoodies and game-day gear, with the note "The Game vs. Harvard is in November"
- **Badges:** Matching cards across the site get an "In season" badge, or "Winter pick" and similar while previewing.
- **Handsome Dan** uses the same picks when asked "what should I wear to the Harvard game?".
- **Why it sells:** It answers "what should I buy right now?" without a search. It is timely, and only shows items that are in stock.

## 3. People wearing the products
- **What:** A "Worn around campus" lookbook of illustrated models, grouped by season tabs.
  - Each model wears the real product photo. The garment is cut out of its photo and lined up to the figure at the collar, shoulders and sleeves.
  - Six skin tones and hairstyles.
  - Every product page has a "Product photo / On a model" switch.
- **Why it sells:** Shoppers judge fit and style on a person, not a flat garment. It works for all 102 products, without a photoshoot.

## 4. Typography, color and product presentation
- **Fonts and palette:** Fraunces, a display serif, for headlines and Inter for body text. The Yale blue palette gets one seasonal accent, and text contrast passes the accessibility standard (≥ 4.5:1) in light and dark mode.
- **Clean product photos:** 73 of the 102 catalogue photos came with black backgrounds or black side bars. Web copies on clean white backgrounds now make navy garments readable. The original files are kept untouched.
- **Cards:** A calmer photo tile, color dots, price chip, garment-type label, seasonal badge and a soft hover lift.
- **Why it sells:** It reads as premium and collegiate, matching officially licensed merchandise. Clear photos and faster scanning mean more products seen per visit.

## 5. Motion
- **Scrolling:** Sections reveal as you scroll. The hero photo drifts gently. Snow, petals, fireflies or leaves fall over the illustrated scenes.
- **Smaller touches:** A slow "Boola Boola · Bulldogs · New Haven · Since 1701" marquee (pausable), page fades, button presses, and a Gothic campus skyline in the footer.
- Everything stays still when the device asks for reduced motion.
- **Why it sells:** It is modern without slowing anyone down, and motion guides the eye to products and the call to action.

## 6. More Handsome Dan in the chat
- **What:**
  - The chat button and header show Dan, who blinks, twitches an ear and bounces when he replies.
  - He wears a seasonal accessory: scarf, flower, sunglasses or maple leaf.
  - One-tap chips: "What's in season?", "Gift ideas", "Fun fact about Handsome Dan", "Show me hoodies", and "What's on my wishlist?" when signed in.
  - A "Did you know?" card draws on 12 verified facts. For example, the first Dan arrived in 1889, and Harvard students dognapped Dan II before the 1934 Game.
- **Why it sells:** A friendly mascot starts conversations, and the chips remove the blank-box problem. Conversations lead to product cards and the bag.

## Fixes made while styling
- **Cards stuck invisible after a season preview:** The scroll-reveal state moved from a CSS class, which React overwrote on re-render, to a `data-revealed` attribute.
- **Stale black photos:** Photo addresses carry a version tag (`?v=2`) and a `no-cache` header, so browsers never keep showing old images.

## Honesty and credits
- The campus photos are real and come from Wikimedia Commons. Each is credited on the page with a license link, and all are listed in `frontend/public/campus/CREDITS.md`.
- The models are labeled illustrations wearing the actual product photos, not fake photoshoots. AI photos aren't possible on the course API key.
- Prices, stock and seasonal picks always come from the database.
