# Design QA

## Source visual truth

- Quote card: `C:\Users\kpash\Documents\Quotes\prototype\references\quote-card-source.jpeg` (1290 x 882).
- Authentication layout: `C:\Users\kpash\Documents\Quotes\prototype\references\auth-layout-source.png` (947 x 703).
- The quote reference is a landscape component, so its hierarchy was adapted to a portrait post without stretching it.
- The authentication reference is a three-screen concept sheet. Its structure was translated to the app palette; the purple brand, invented product name, Facebook control, and filled demo credentials were intentionally not copied.

## Rendered implementation evidence

- Feed screen: `C:\Users\kpash\Documents\Quotes\prototype\qa\implementation-home-v3-iphone.png`.
- Authentication screen: `C:\Users\kpash\Documents\Quotes\prototype\qa\implementation-auth-v3-iphone.png`.
- Quote comparison: `C:\Users\kpash\Documents\Quotes\prototype\qa\quote-reference-implementation-v3-comparison.png`.
- Authentication comparison: `C:\Users\kpash\Documents\Quotes\prototype\qa\auth-reference-implementation-v3-comparison.png`.
- Primary capture viewport: 393 x 852 CSS pixels (iPhone), device scale factor 1.
- Secondary responsive check: 427 x 952 CSS pixels (Pixel 10), with authentication checked both keyboard-open and keyboard-closed.
- State: signed-out feed and signed-out authentication. Fields are intentionally empty; no account or successful sign-in is simulated.

## Findings

- No actionable P0, P1, or P2 visual or interaction issues remain.
- Quote fidelity: the card retains the source's dominant cycling photo, lower dark fade, large white quote, softer note, and lower-right save placement. Like was added as a product requirement, and the portrait wrap is intentional.
- Image treatment: picture-backed cards now use a neutral black lower readability gradient in both the feed and live editor; the olive gradient is reserved for text-only cards.
- Authentication fidelity: the implementation follows the supplied green-hero/rounded-white-form structure with a top account-mode action, centered welcome copy, outlined fields, full-width submit action, divider, and Google/Gmail control.
- App identity: no app name was invented. The authentication hero uses a short editorial line in place of the reference's product logo slot.
- Data integrity: no names, handles, engagement counts, providers, or login values were fabricated. The source quote has no poster information, so its creator panel explicitly says that the account is not listed.
- Creator access: horizontal swipe remains available, and visible 44px `Creator` / `Quote` controls provide the same path for keyboard and single-pointer users.
- Paging: each quote owns a viewport-sized vertical stage. After the protected mobile runtime finishes momentum, GSAP settles to the nearest stage and clamps a release to at most one stage forward or backward. No CSS scroll snap was layered over runtime physics.
- Accessibility: auth is a labelled modal layer with initial focus, Escape handling, contained Tab order, visible focus states, announced errors, and reduced-motion handling. Like/save actions retain pressed states and accessible labels.
- Authentication truthfulness: the unconfigured preview explains that Firebase project values are required. Google/Gmail and email/password retain their real provider paths once configured. A clearly labelled, development-only test email account now unlocks local feature testing and is excluded from production builds.
- P3 capture-only artifact: the protected preview runtime's translucent pointer indicator is visible near the top-right action in the authentication evidence. It appears only while the desktop pointer is active and is not part of the app UI.

## Comparison and iteration history

1. Fixed the initial Tailwind prefix issue so mobile layout utilities applied correctly.
2. Removed decorative quote marks from the post after comparison showed copy drift from the quote-card source.
3. Added vertical feed reveal and horizontal creator reveal without introducing fake creator data.
4. The first authentication implementation used a utility bottom sheet. The newly supplied login reference superseded that direction, so authentication was rebuilt as a full-screen green layer with a rounded warm-white form surface.
5. The first form state auto-focused an email field and opened the keyboard immediately. The final state focuses Back, keeps the keyboard closed until a field is chosen, and preserves the title above both iPhone and Pixel keyboards.
6. Replaced partial free-stop scrolling with viewport-sized stages plus post-momentum GSAP settling. A browser-driven 480-pixel vertical scroll settled from the first stage to the next stage at `scrollTop: 751`, showing one complete destination stage with no adjacent post fragment.
7. Replaced the conventional quote/context/image form with a modal-style live card editor. Quote and context are edited directly inside the card, while image actions sit on the card itself.

## Primary interactions verified

- One-stage vertical feed advance and reverse-ready settling.
- Horizontal quote-to-creator swipe remains independent of vertical feed movement.
- Visible Creator and Quote controls move the carousel to logical offsets `359` and `0` on iPhone.
- The Create flow is a live card editor rather than a typical form. It accepts one optional image up to 6 MB, updates text and imagery in place, supports replacement/removal, and publishes the composed card.
- Sign-in open and close, sign-in/sign-up mode switch, and focus return path.
- iPhone and Pixel 10 authentication layout, keyboard-open and keyboard-closed.
- Email/password validation path and honest unconfigured-provider messaging.
- Google/Gmail setup action without a simulated login.
- Development-only test email sign-in through Profile, Create, creator reveal, Save, and Saved-library flows.
- Direct-on-card quote/context editing plus real local file selection through live preview, publish, and rendered image-backed feed card; invalid file type and size states are handled inline.
- Protected mobile runtime integrity, TypeScript, production build, and all four Sites packaging tests.

## Remaining dependency

- Live authentication cannot be completed end-to-end until a Firebase Web API key and Google OAuth Web client ID are supplied in `.env.local`. Setup is documented in `AUTH_SETUP.md`.
- The temporary account is available only from the Vite development preview and does not survive a page reload.
- Quote persistence, likes, and saves remain session state; a shared database is outside this UI/auth change.
- Selected card images are stored as local data URLs for the active session and are not uploaded to cloud storage.

final result: passed
