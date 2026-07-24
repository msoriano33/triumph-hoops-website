# Content guide — how to update the site

Most updates happen in **one file**: `assets/js/site-data.js`. Open it in any text editor,
change the text between the quotation marks, save, and re-upload. Nothing else moves.

## Where things live

| What you want to change                        | Where                                                        |
|------------------------------------------------|--------------------------------------------------------------|
| Coach Oli's phone number                       | `site-data.js` → `contactInfo.phoneDisplay` and `phoneHref`  |
| Instagram link (hidden until you add one)      | `site-data.js` → `contactInfo.instagram`                     |
| Sunday session times, levels, coaches          | `site-data.js` → `trainingSchedule.sunday`                   |
| Weekly training note                           | `site-data.js` → `trainingSchedule.weeklyNote` / `weeklyLead`|
| Gyms and addresses                             | `site-data.js` → `locations`                                 |
| Coaching staff and photos                      | `site-data.js` → `staff`                                     |
| Junior Wolves tryout dates, practices, season  | `site-data.js` → `juniorWolvesSeason`                        |
| Junior Wolves fees                             | `site-data.js` → `juniorWolvesFees`                          |
| Brand colors                                   | `assets/css/styles.css` → the token block at the very top    |
| Philosophy copy, program descriptions, FAQ     | directly in the `.html` files, marked `EDIT:` in comments    |

Anything left as `"TBA"` displays on the site as a small **To be announced** chip. That's
intentional — the site never invents a date, price or address.

## Common tasks

**Add a Sunday session.** Copy one block inside `trainingSchedule.sunday` and edit it:

```js
{
  time: "2:00 PM",
  title: "Advanced Skills",
  who: "Approx. grades 6–8",
  detail: "Faster pace with live play.",
  coach: "Coach Marc Acoba",
  status: ""            // set to "Full" or "Paused" to flag it
}
```

**Publish Junior Wolves fees.** In `juniorWolvesFees`, replace each `"TBA"`:

```js
status: "Published",
amount: "$450",
includes: "League fees, practices, uniform, coaching",
paymentDue: "Within one week of placement",
```

The fee appears in Season at a glance, the Program fees section, and three FAQ answers at
once — because they all read the same value.

**Add a coach.** In `staff`, copy a block. To add a photo, put the image in `assets/img/`
and set `photo: "assets/img/coach-name.jpg"`. Portraits look best at 4:5 (e.g. 800×1000).
Leave `bio: ""` until you have real bio copy — the card just shows the name and role.

**Add a gym.** In `locations`, copy a block. Leave `address` as `"[ADDRESS TO BE SUPPLIED]"`
and the card shows "Address coming soon" rather than an empty line.

**Change a headline or paragraph.** Open the relevant `.html` file and search for the words
you want to change. The text sits in plain view between tags — edit the words, leave the
`<tags>` alone.

## Adding photos

Photo placeholders are marked in the HTML with comments like
`<!-- MEDIA SLOT: weekly training photo -->`. Replace the placeholder `<div>` with:

```html
<img src="assets/img/your-photo.jpg" alt="Triumph players working through a shooting drill"
     width="1600" height="1067" loading="lazy">
```

Keep the `alt` text descriptive — it's read aloud to visually impaired visitors and helps
search results. Compress images before uploading (squoosh.app is free); aim for under
300 KB each. The hero on the home page can take a photo or a short muted video loop; the
comment in `index.html` shows the exact markup for both.

## Two rules worth keeping

1. **Don't publish a number you haven't confirmed.** A "To be announced" chip costs the
   program nothing. A wrong tryout date costs a Saturday.
2. **Keep Triumph and Junior Wolves distinct.** Triumph is open to any family, anywhere.
   Junior Wolves is only for players inside the Niles West district who will attend Niles
   West High School. The site is careful about that line throughout — new copy should be too.
