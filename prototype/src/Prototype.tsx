import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  Cross2Icon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  Pencil1Icon,
  PersonIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { gsap } from "gsap";
import {
  AuthError,
  commitSession,
  firebaseAuthConfigured,
  getGoogleClientId,
  googleAuthConfigured,
  restoreSession,
  signInWithEmail,
  signInWithGoogleCredential,
  signOut,
  updateDisplayName,
  type AuthUser,
} from "./auth";
import {
  Carousel,
  KeyboardInput,
  KeyboardTextarea,
  MobileScroll,
  useKeyboard,
  useMobileDevice,
} from "./mobile";

type Tab = "feed" | "create" | "saved" | "profile";
type AuthMode = "signIn" | "signUp";

type Creator = {
  uid: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
};

type Quote = {
  id: string;
  text: string;
  note?: string;
  image?: string;
  imageAlt?: string;
  creator?: Creator;
};

type QuoteDraft = Pick<Quote, "text" | "note" | "image">;

type Profile = {
  name: string;
  bio: string;
  avatarUrl?: string;
};

type PendingIntent =
  | { type: "like"; quoteId: string }
  | { type: "save"; quoteId: string }
  | { type: "tab"; tab: Exclude<Tab, "feed"> }
  | { type: "create" };

type GoogleCredentialResponse = {
  credential: string;
};

type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      shape: "pill";
      text: "continue_with";
      logo_alignment: "left";
      width: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdentityApi;
      };
    };
  }
}

const referenceQuote: Quote = {
  id: "reference-quote",
  text: "I love you but I can't see you in my future",
  note: "There really is something like that, isn't there?",
  image: "/assets/quotes/countryside-ride.png",
  imageAlt: "Two friends enjoying a countryside bicycle ride",
};

const navItems: Array<{ id: Tab; label: string; icon: typeof HomeIcon }> = [
  { id: "feed", label: "Home", icon: HomeIcon },
  { id: "create", label: "Create", icon: PlusIcon },
  { id: "saved", label: "Saved", icon: BookmarkIcon },
  { id: "profile", label: "Profile", icon: PersonIcon },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const previewTestAuthEnabled = import.meta.env.DEV && !firebaseAuthConfigured;

const createPreviewTestUser = (): AuthUser => ({
  uid: "preview-test-user",
  email: "tester@quotes.test",
  displayName: "Test Creator",
  photoUrl: null,
  providerId: "password",
  idToken: "preview-only-id-token",
  refreshToken: "preview-only-refresh-token",
  expiresAt: Date.now() + 8 * 60 * 60 * 1_000,
});

const moveQuoteCarousel = (
  event: MouseEvent<HTMLButtonElement>,
  destination: "quote" | "creator",
) => {
  const carousel = event.currentTarget.closest<HTMLElement>(".mobile-carousel");
  if (!carousel) return;

  const left = destination === "creator"
    ? Math.max(0, carousel.scrollWidth - carousel.clientWidth)
    : 0;

  carousel.scrollTo({
    left,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
};

const profileFromUser = (user: AuthUser): Profile | null => {
  if (!user.displayName) return null;
  return {
    name: user.displayName,
    bio: "",
    avatarUrl: user.photoUrl || undefined,
  };
};

export default function Prototype() {
  const appRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const pendingIntentRef = useRef<PendingIntent | null>(null);
  const authGenerationRef = useRef(0);
  const authTriggerRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [quotes, setQuotes] = useState<Quote[]>([referenceQuote]);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseAuthConfigured);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [authReason, setAuthReason] = useState("Sign in to save, like, and publish quotes.");
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);

  const savedQuotes = useMemo(
    () => quotes.filter((quote) => savedIds.has(quote.id)),
    [quotes, savedIds],
  );

  const ownQuotes = useMemo(
    () => quotes.filter((quote) => quote.creator?.uid === authUser?.uid),
    [authUser?.uid, quotes],
  );

  useEffect(() => {
    let active = true;
    const generation = authGenerationRef.current;
    void restoreSession()
      .then((user) => {
        if (!active || !user || generation !== authGenerationRef.current) return;
        commitSession(user);
        setAuthUser(user);
        setProfile(profileFromUser(user));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set([".feed-heading > *", ".app-nav"], { clearProps: "all" });
        return;
      }
      gsap.fromTo(
        ".feed-heading > *",
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, stagger: 0.08, delay: 0.08, duration: 0.48, ease: "power2.out" },
      );
      gsap.fromTo(
        ".app-nav",
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, delay: 0.18, duration: 0.55, ease: "power3.out" },
      );
    }, appRef);

    return () => context.revert();
  }, []);

  useLayoutEffect(() => {
    if (!viewRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(viewRef.current, { autoAlpha: 1, clearProps: "transform" });
      return;
    }
    gsap.fromTo(
      viewRef.current,
      { autoAlpha: 0, x: activeTab === "feed" ? -10 : 10 },
      { autoAlpha: 1, x: 0, duration: 0.34, ease: "power2.out", clearProps: "transform" },
    );
  }, [activeTab]);

  useEffect(() => {
    if (!toast || !toastRef.current) return;
    const element = toastRef.current;
    if (prefersReducedMotion()) {
      gsap.set(element, { autoAlpha: 1, y: 0, scale: 1 });
      const reducedMotionTimer = window.setTimeout(() => setToast(null), 1800);
      return () => window.clearTimeout(reducedMotionTimer);
    }
    const timeline = gsap.timeline();
    timeline
      .fromTo(
        element,
        { autoAlpha: 0, y: 14, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(2)" },
      )
      .to(element, { autoAlpha: 0, y: 8, duration: 0.22, ease: "power2.in", delay: 1.45 });

    const timer = window.setTimeout(() => setToast(null), 2100);
    return () => {
      window.clearTimeout(timer);
      timeline.kill();
    };
  }, [toast]);

  const showToast = (message: string) => setToast({ key: Date.now(), message });

  const pulse = (target: EventTarget & HTMLButtonElement) => {
    if (prefersReducedMotion()) return;
    gsap
      .timeline()
      .to(target, { scale: 0.84, duration: 0.08 })
      .to(target, { scale: 1, duration: 0.38, ease: "back.out(3.2)" });
  };

  const applyLike = (quoteId: string) => {
    const willLike = !likedIds.has(quoteId);
    setLikedIds((current) => {
      const next = new Set(current);
      willLike ? next.add(quoteId) : next.delete(quoteId);
      return next;
    });
    showToast(willLike ? "Quote liked" : "Like removed");
  };

  const applySave = (quoteId: string) => {
    const willSave = !savedIds.has(quoteId);
    setSavedIds((current) => {
      const next = new Set(current);
      willSave ? next.add(quoteId) : next.delete(quoteId);
      return next;
    });
    showToast(willSave ? "Saved for later" : "Removed from saved");
  };

  const executeIntent = (intent: PendingIntent) => {
    if (intent.type === "like") applyLike(intent.quoteId);
    if (intent.type === "save") applySave(intent.quoteId);
    if (intent.type === "tab") setActiveTab(intent.tab);
    if (intent.type === "create") setActiveTab("create");
  };

  const requestAuth = (intent: PendingIntent | null, reason: string) => {
    if (authUser) {
      if (intent) executeIntent(intent);
      return;
    }
    authTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    pendingIntentRef.current = intent;
    setAuthReason(reason);
    setAuthSheetOpen(true);
  };

  const toggleLike = (quoteId: string, event: MouseEvent<HTMLButtonElement>) => {
    pulse(event.currentTarget);
    if (!authUser) {
      requestAuth({ type: "like", quoteId }, "Sign in to like this quote during your current session.");
      return;
    }
    applyLike(quoteId);
  };

  const toggleSave = (quoteId: string, event: MouseEvent<HTMLButtonElement>) => {
    pulse(event.currentTarget);
    if (!authUser) {
      requestAuth({ type: "save", quoteId }, "Sign in to save this quote in your current library.");
      return;
    }
    applySave(quoteId);
  };

  const publishQuote = (draft: QuoteDraft) => {
    if (!authUser || !profile) {
      requestAuth({ type: "create" }, "Sign in and finish your profile before publishing a quote.");
      return;
    }
    const nextQuote: Quote = {
      ...draft,
      id: `quote-${Date.now()}`,
      creator: {
        uid: authUser.uid,
        name: profile.name,
        bio: profile.bio || undefined,
        avatarUrl: profile.avatarUrl,
      },
    };
    setQuotes((current) => [nextQuote, ...current]);
    setActiveTab("feed");
    showToast("Quote published");
  };

  const handleAuthenticated = (user: AuthUser) => {
    const pending = pendingIntentRef.current;
    const focusTarget = authTriggerRef.current;
    pendingIntentRef.current = null;
    authTriggerRef.current = null;
    authGenerationRef.current += 1;
    commitSession(user);
    setAuthUser(user);
    setProfile(profileFromUser(user));
    setLikedIds(new Set());
    setSavedIds(new Set());
    setAuthSheetOpen(false);

    window.setTimeout(() => {
      if (pending) executeIntent(pending);
      else showToast("Signed in");
      if (focusTarget?.isConnected) focusTarget.focus();
    }, prefersReducedMotion() ? 0 : 180);
  };

  const handleAuthOpenChange = (open: boolean) => {
    setAuthSheetOpen(open);
    if (open) return;

    pendingIntentRef.current = null;
    const focusTarget = authTriggerRef.current;
    authTriggerRef.current = null;
    window.requestAnimationFrame(() => {
      if (focusTarget?.isConnected) focusTarget.focus();
    });
  };

  const handleSaveProfile = (nextProfile: Profile) => {
    const wasProfileSet = Boolean(profile);
    setProfile(nextProfile);
    showToast(wasProfileSet ? "Profile updated" : "Profile created");
    if (authUser && nextProfile.name !== authUser.displayName) {
      const generation = authGenerationRef.current;
      const uid = authUser.uid;
      void updateDisplayName(authUser, nextProfile.name)
        .then((nextUser) => {
          if (generation !== authGenerationRef.current || nextUser.uid !== uid) return;
          commitSession(nextUser);
          setAuthUser(nextUser);
        })
        .catch(() => showToast("Profile saved for this session"));
    }
  };

  const handleSignOut = () => {
    authGenerationRef.current += 1;
    signOut();
    pendingIntentRef.current = null;
    setAuthUser(null);
    setProfile(null);
    setLikedIds(new Set());
    setSavedIds(new Set());
    setActiveTab("feed");
    showToast("Signed out");
  };

  const handleTabSelect = (tab: Tab, event: MouseEvent<HTMLButtonElement>) => {
    pulse(event.currentTarget);
    if (tab === "feed" || authUser) {
      setActiveTab(tab);
      return;
    }
    const reasonByTab: Record<Exclude<Tab, "feed">, string> = {
      create: "Sign in to publish quotes under your account.",
      saved: "Sign in to open your saved quote library.",
      profile: "Sign in to create or view your quote profile.",
    };
    requestAuth({ type: "tab", tab }, reasonByTab[tab]);
  };

  return (
    <div ref={appRef} className="quote-app tw:relative tw:h-full tw:w-full tw:overflow-hidden">
      <div
        ref={viewRef}
        key={activeTab}
        className="tw:absolute tw:inset-0"
        aria-hidden={authSheetOpen || undefined}
      >
        {activeTab === "feed" ? (
          <FeedScreen
            quotes={quotes}
            likedIds={likedIds}
            savedIds={savedIds}
            authUser={authUser}
            authReady={authReady}
            onLike={toggleLike}
            onSave={toggleSave}
            onCreate={() =>
              requestAuth({ type: "create" }, "Sign in to publish quotes under your account.")
            }
            onAccount={() => {
              if (authUser) setActiveTab("profile");
              else requestAuth(null, "Sign in with Google or email to create your quote profile.");
            }}
          />
        ) : null}
        {activeTab === "create" ? (
          <CreateScreen
            profile={profile}
            onGoToProfile={() => setActiveTab("profile")}
            onPublish={publishQuote}
            onCancel={() => setActiveTab("feed")}
          />
        ) : null}
        {activeTab === "saved" ? (
          <SavedScreen quotes={savedQuotes} onBrowse={() => setActiveTab("feed")} />
        ) : null}
        {activeTab === "profile" ? (
          <ProfileScreen
            profile={profile}
            user={authUser}
            quotes={ownQuotes}
            onSaveProfile={handleSaveProfile}
            onCreate={() => setActiveTab("create")}
            onSignOut={handleSignOut}
          />
        ) : null}
      </div>

      {!authSheetOpen ? (
        <nav className="app-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="nav-item"
                data-active={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => handleTabSelect(item.id, event)}
              >
                <Icon width={20} height={20} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <AuthSheet
        open={authSheetOpen}
        reason={authReason}
        onOpenChange={handleAuthOpenChange}
        onAuthenticated={handleAuthenticated}
      />

      {toast ? (
        <div ref={toastRef} key={toast.key} className="app-toast" role="status">
          <CheckIcon width={16} height={16} aria-hidden="true" />
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function FeedScreen({
  quotes,
  likedIds,
  savedIds,
  authUser,
  authReady,
  onLike,
  onSave,
  onCreate,
  onAccount,
}: {
  quotes: Quote[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  authUser: AuthUser | null;
  authReady: boolean;
  onLike: (quoteId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onSave: (quoteId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onCreate: () => void;
  onAccount: () => void;
}) {
  const feedRef = useRef<HTMLElement>(null);
  const { device } = useMobileDevice();

  useLayoutEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(".quote-feed-item"));
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      gsap.set(items, { clearProps: "all" });
      return;
    }

    const root = container.closest<HTMLElement>(".mobile-scroll");
    items.forEach((item) => {
      if (!item.dataset.revealed) gsap.set(item, { autoAlpha: 0.36, y: 34, scale: 0.972 });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.22) return;
          const item = entry.target as HTMLElement;
          if (item.dataset.revealed) return;
          item.dataset.revealed = "true";
          gsap.to(item, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.68,
            ease: "power3.out",
            clearProps: "transform",
          });
          observer.unobserve(item);
        });
      },
      { root, threshold: [0.22, 0.5] },
    );

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      gsap.killTweensOf(items);
    };
  }, [quotes.length]);

  useEffect(() => {
    const container = feedRef.current;
    const scroll = container?.closest<HTMLElement>(".mobile-scroll");
    if (!container || !scroll) return;

    let settleTimer = 0;
    let settleFrame: number | null = null;
    let snapTween: gsap.core.Tween | null = null;
    let isSnapping = false;
    let pointerActive = false;
    let settledIndex = 0;

    const cancelSnap = () => {
      window.clearTimeout(settleTimer);
      if (settleFrame !== null) {
        window.cancelAnimationFrame(settleFrame);
        settleFrame = null;
      }
      snapTween?.kill();
      snapTween = null;
      isSnapping = false;
      const targets = getSnapTargets();
      if (targets.length) settledIndex = nearestTargetIndex(targets);
    };

    const getSnapTargets = () => {
      const scrollRect = scroll.getBoundingClientRect();
      const visualScale = scroll.clientHeight > 0 ? scrollRect.height / scroll.clientHeight : 1;
      const headerOffset = device.platform === "android" ? 142 : 132;
      const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);

      return Array.from(container.querySelectorAll<HTMLElement>(".feed-snap-point")).map((item, index) => {
        if (index === 0) return 0;
        const itemTop =
          (item.getBoundingClientRect().top - scrollRect.top) / visualScale + scroll.scrollTop;
        return Math.max(0, Math.min(maxTop, itemTop - headerOffset));
      });
    };

    const nearestTargetIndex = (targets: number[]) =>
      targets.reduce(
        (nearest, candidate, index) =>
          Math.abs(candidate - scroll.scrollTop) < Math.abs(targets[nearest] - scroll.scrollTop)
            ? index
            : nearest,
        0,
      );

    settledIndex = nearestTargetIndex(getSnapTargets());

    const settleOnPost = () => {
      const targets = getSnapTargets();
      if (!targets.length) return;
      const nearestIndex = nearestTargetIndex(targets);
      const targetIndex = Math.max(
        settledIndex - 1,
        Math.min(settledIndex + 1, nearestIndex),
      );
      const target = targets[targetIndex];

      if (Math.abs(target - scroll.scrollTop) < 1) {
        settledIndex = targetIndex;
        return;
      }
      if (prefersReducedMotion()) {
        scroll.scrollTop = target;
        settledIndex = targetIndex;
        return;
      }

      isSnapping = true;
      const position = { value: scroll.scrollTop };
      snapTween = gsap.to(position, {
        value: target,
        duration: 0.46,
        ease: "power3.out",
        onUpdate: () => {
          scroll.scrollTop = position.value;
        },
        onComplete: () => {
          snapTween = null;
          isSnapping = false;
          settledIndex = targetIndex;
        },
      });
    };

    const queueSettle = () => {
      if (isSnapping || pointerActive || settleFrame !== null) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleOnPost, 140);
    };

    const watchMomentumThenSettle = () => {
      let lastTop = scroll.scrollTop;
      let stableFrames = 0;

      const check = () => {
        if (pointerActive) {
          settleFrame = null;
          return;
        }

        const currentTop = scroll.scrollTop;
        stableFrames = Math.abs(currentTop - lastTop) < 0.25 ? stableFrames + 1 : 0;
        lastTop = currentTop;

        if (stableFrames >= 7) {
          settleFrame = null;
          settleOnPost();
          return;
        }

        settleFrame = window.requestAnimationFrame(check);
      };

      settleFrame = window.requestAnimationFrame(check);
    };

    const beginGesture = () => {
      pointerActive = true;
      cancelSnap();
    };

    const endGesture = () => {
      pointerActive = false;
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
      watchMomentumThenSettle();
    };

    scroll.addEventListener("scroll", queueSettle, { passive: true });
    scroll.addEventListener("pointerdown", beginGesture, true);
    scroll.addEventListener("pointerup", endGesture, true);
    scroll.addEventListener("pointercancel", endGesture, true);
    window.addEventListener("pointerup", endGesture, true);
    window.addEventListener("pointercancel", endGesture, true);
    return () => {
      cancelSnap();
      scroll.removeEventListener("scroll", queueSettle);
      scroll.removeEventListener("pointerdown", beginGesture, true);
      scroll.removeEventListener("pointerup", endGesture, true);
      scroll.removeEventListener("pointercancel", endGesture, true);
      window.removeEventListener("pointerup", endGesture, true);
      window.removeEventListener("pointercancel", endGesture, true);
    };
  }, [device.platform, quotes.length]);

  const accountInitial = authUser?.displayName?.charAt(0).toUpperCase() || "";

  return (
    <MobileScroll className="app-screen feed-page">
      <main
        ref={feedRef}
        className="screen-content feed-screen"
        data-testid="feed-screen"
        style={{
          "--feed-stage-height": "100dvh",
          "--feed-card-width": "min(345px, calc(100vw - 48px))",
        } as CSSProperties}
      >
        <header className="feed-heading tw:flex tw:items-end tw:justify-between">
          <div>
            <p className="eyebrow">Discover</p>
            <h1>For you</h1>
          </div>
          <div className="feed-heading-actions">
            <button
              type="button"
              className="feed-account-button"
              data-authenticated={Boolean(authUser)}
              aria-label={authUser ? "Open profile" : "Sign in"}
              disabled={!authReady}
              onClick={onAccount}
            >
              {authUser ? accountInitial || <PersonIcon width={17} height={17} aria-hidden="true" /> : "Sign in"}
            </button>
            <p className="gesture-hint" aria-hidden="true">
              <span>Scroll <ArrowDownIcon width={12} height={12} /></span>
              <span>Swipe <ArrowRightIcon width={12} height={12} /></span>
            </p>
          </div>
        </header>

        <section className="quote-feed-list" aria-label="Quote feed">
          {quotes.map((quote) => (
            <div key={quote.id} className="quote-feed-item feed-snap-point">
              <Carousel
                ariaLabel={`Quote and creator information for ${quote.text}`}
                className="quote-reveal"
                contentClassName="quote-reveal-track"
              >
                <QuoteCard
                  quote={quote}
                  liked={likedIds.has(quote.id)}
                  saved={savedIds.has(quote.id)}
                  authenticated={Boolean(authUser)}
                  onLike={onLike}
                  onSave={onSave}
                />
                <CreatorPanel creator={quote.creator} />
              </Carousel>
            </div>
          ))}
          <div className="feed-create-stage feed-snap-point">
            <button type="button" className="new-quote-card feed-create-card" onClick={onCreate} aria-label="Create a new quote">
              <span className="new-quote-icon"><PlusIcon width={22} height={22} aria-hidden="true" /></span>
              <strong>Your next quote starts here.</strong>
              <span>Create quote</span>
            </button>
          </div>
        </section>
      </main>
    </MobileScroll>
  );
}

function QuoteCard({
  quote,
  liked,
  saved,
  authenticated,
  onLike,
  onSave,
}: {
  quote: Quote;
  liked: boolean;
  saved: boolean;
  authenticated: boolean;
  onLike: (quoteId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onSave: (quoteId: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <article className="quote-card tw:relative tw:shrink-0 tw:overflow-hidden" data-with-image={Boolean(quote.image)}>
      {quote.image ? (
        <img
          className="quote-photo"
          src={quote.image}
          alt={quote.imageAlt ?? ""}
          aria-hidden={quote.imageAlt ? undefined : true}
        />
      ) : null}
      <div className="quote-card-shade" aria-hidden="true" />
      <button
        type="button"
        className="creator-reveal-control"
        onClick={(event) => moveQuoteCarousel(event, "creator")}
      >
        Creator <ArrowRightIcon width={14} height={14} aria-hidden="true" />
      </button>
      <div className="quote-card-content">
        <blockquote>{quote.text}</blockquote>
        {quote.note ? <p className="quote-note">{quote.note}</p> : null}
      </div>
      <div className="quote-actions">
        <button
          type="button"
          className="quote-action"
          data-active={liked}
          aria-label={authenticated ? (liked ? "Unlike quote" : "Like quote") : "Sign in to like quote"}
          aria-pressed={liked}
          onClick={(event) => onLike(quote.id, event)}
        >
          <HeartIcon width={22} height={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="quote-action"
          data-active={saved}
          aria-label={authenticated ? (saved ? "Remove quote from saved" : "Save quote") : "Sign in to save quote"}
          aria-pressed={saved}
          onClick={(event) => onSave(quote.id, event)}
        >
          <BookmarkIcon width={22} height={22} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function CreatorPanel({ creator }: { creator?: Creator }) {
  if (!creator) {
    return (
      <aside className="creator-panel" data-empty="true" aria-label="Creator information unavailable">
        <div className="creator-panel-top">
          <span className="creator-avatar" aria-hidden="true"><PersonIcon width={25} height={25} /></span>
          <div>
            <p className="creator-kicker">Creator</p>
            <h2>Not listed</h2>
          </div>
        </div>
        <div className="creator-panel-body">
          <p>The supplied quote card did not include a poster account.</p>
        </div>
        <div className="creator-panel-footer">
          <span>No account data added</span>
          <button
            type="button"
            className="creator-return-control"
            onClick={(event) => moveQuoteCarousel(event, "quote")}
          >
            <ChevronLeftIcon width={14} height={14} aria-hidden="true" /> Quote
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="creator-panel" aria-label={`Creator account for ${creator.name}`}>
      <div className="creator-panel-top">
        <span className="creator-avatar" aria-hidden="true">
          {creator.avatarUrl ? <img src={creator.avatarUrl} alt="" referrerPolicy="no-referrer" /> : creator.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <p className="creator-kicker">Creator</p>
          <h2>{creator.name}</h2>
        </div>
      </div>
      <div className="creator-panel-body">
        {creator.bio ? <p>{creator.bio}</p> : <p>This account has not added a bio yet.</p>}
      </div>
      <div className="creator-panel-footer">
        <span>Posted this quote</span>
        <button
          type="button"
          className="creator-return-control"
          onClick={(event) => moveQuoteCarousel(event, "quote")}
        >
          <ChevronLeftIcon width={14} height={14} aria-hidden="true" /> Quote
        </button>
      </div>
    </aside>
  );
}

function CreateScreen({
  profile,
  onGoToProfile,
  onPublish,
  onCancel,
}: {
  profile: Profile | null;
  onGoToProfile: () => void;
  onPublish: (quote: QuoteDraft) => void;
  onCancel: () => void;
}) {
  const keyboard = useKeyboard();
  const editorRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [quoteText, setQuoteText] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState("");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");

  useLayoutEffect(() => {
    if (!profile || !editorRef.current || prefersReducedMotion()) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        ".live-card-editor",
        { autoAlpha: 0, y: 22, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.58, ease: "power3.out" },
      );
      gsap.fromTo(
        [".card-editor-header", ".card-editor-footer"],
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.42, ease: "power2.out" },
      );
    }, editorRef);
    return () => context.revert();
  }, [profile]);

  if (!profile) {
    return (
      <MobileScroll className="app-screen">
        <main className="screen-content standard-screen" data-testid="create-screen">
          <ScreenHeader eyebrow="Create" title="Add a quote" />
          <section className="quiet-empty tw:flex tw:flex-col tw:items-start">
            <span className="empty-icon"><PersonIcon width={24} height={24} aria-hidden="true" /></span>
            <h2>Finish your profile first</h2>
            <p>Your real display name will appear with quotes you publish.</p>
            <button type="button" className="primary-button" onClick={onGoToProfile}>Create profile</button>
          </section>
        </main>
      </MobileScroll>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanQuote = quoteText.trim();
    if (!cleanQuote) {
      setError("Write a quote before publishing.");
      return;
    }
    keyboard.hide();
    onPublish({ text: cleanQuote, note: note.trim() || undefined, image });
    setQuoteText("");
    setNote("");
    setImage(undefined);
    setImageName("");
    if (imageInputRef.current) imageInputRef.current.value = "";
    setError("");
    setImageError("");
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Choose a JPG, PNG, WEBP, or another image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setImageError("Choose an image smaller than 6 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setImageError("This image could not be read. Choose another file.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setImage(reader.result);
      setImageName(file.name);
      setImageError("");
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage(undefined);
    setImageName("");
    setImageError("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const closeEditor = () => {
    keyboard.hide();
    onCancel();
  };

  return (
    <MobileScroll className="app-screen create-editor-page">
      <main ref={editorRef} className="screen-content card-editor-screen" data-testid="create-screen">
        <header className="card-editor-header">
          <button type="button" className="card-editor-close" aria-label="Close card editor" onClick={closeEditor}>
            <Cross2Icon width={18} height={18} aria-hidden="true" />
          </button>
          <div>
            <p>Create</p>
            <h1>New quote card</h1>
          </div>
          <span className="live-preview-badge">Live</span>
        </header>

        <form className="card-editor-form" onSubmit={handleSubmit}>
          <section
            className="live-card-editor"
            data-with-image={Boolean(image)}
            aria-label="Live quote card editor"
          >
            {image ? <img className="live-card-image" src={image} alt="" aria-hidden="true" /> : null}
            <div className="live-card-shade" aria-hidden="true" />

            <div className="card-media-actions">
              <label className="card-image-control">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  aria-label={image ? "Change quote card image" : "Add image to quote card"}
                  aria-describedby={imageError ? "quote-image-error" : "quote-card-help"}
                  onChange={handleImageChange}
                />
                <ImageIcon width={16} height={16} aria-hidden="true" />
                <span>{image ? "Change" : "Add image"}</span>
              </label>
              {image ? (
                <button type="button" className="card-image-remove" aria-label="Remove quote card image" onClick={removeImage}>
                  <Cross2Icon width={17} height={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="live-card-copy">
              <KeyboardTextarea
                className="live-quote-input"
                value={quoteText}
                onChange={(event) => {
                  setQuoteText(event.target.value);
                  if (error) setError("");
                }}
                onBlur={() => keyboard.hide()}
                maxLength={180}
                rows={5}
                placeholder="Write your quote…"
                aria-label="Quote text"
                aria-describedby={error ? "quote-error" : "quote-card-help"}
              />
              <KeyboardTextarea
                className="live-note-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => keyboard.hide()}
                maxLength={120}
                rows={2}
                placeholder="Add context (optional)"
                aria-label="Quote context"
              />
              <span className="quote-character-count" aria-hidden="true">{quoteText.length}/180</span>
            </div>
          </section>

          <div className="card-editor-footer">
            <div id="quote-card-help" className="card-editor-status" aria-live="polite">
              <span>{imageName || "Text-only card"}</span>
              <small>Tap the card to edit</small>
            </div>
            {imageError ? <p id="quote-image-error" className="composer-error" role="alert">{imageError}</p> : null}
            {error ? <p id="quote-error" className="composer-error" role="alert">{error}</p> : null}
            <button type="submit" className="primary-button card-publish-button">Publish card</button>
          </div>
        </form>
      </main>
    </MobileScroll>
  );
}

function SavedScreen({ quotes, onBrowse }: { quotes: Quote[]; onBrowse: () => void }) {
  return (
    <MobileScroll className="app-screen">
      <main className="screen-content standard-screen" data-testid="saved-screen">
        <ScreenHeader eyebrow="Library" title="Saved" />
        {quotes.length === 0 ? (
          <section className="quiet-empty tw:flex tw:flex-col tw:items-start">
            <span className="empty-icon"><BookmarkIcon width={24} height={24} aria-hidden="true" /></span>
            <h2>Nothing saved yet</h2>
            <p>Quotes you bookmark will stay here for this prototype session.</p>
            <button type="button" className="secondary-button" onClick={onBrowse}>Browse quotes</button>
          </section>
        ) : (
          <section className="saved-list" aria-label="Saved quotes">
            {quotes.map((quote) => (
              <article key={quote.id} className="saved-row">
                {quote.image ? <img src={quote.image} alt="" aria-hidden="true" /> : <span className="saved-color" aria-hidden="true" />}
                <div>
                  <blockquote>{quote.text}</blockquote>
                  {quote.creator ? <p>{quote.creator.name}</p> : null}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </MobileScroll>
  );
}

function ProfileScreen({
  profile,
  user,
  quotes,
  onSaveProfile,
  onCreate,
  onSignOut,
}: {
  profile: Profile | null;
  user: AuthUser | null;
  quotes: Quote[];
  onSaveProfile: (profile: Profile) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  const keyboard = useKeyboard();
  const [editing, setEditing] = useState(!profile);
  const [name, setName] = useState(profile?.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Add a display name to continue.");
      return;
    }
    keyboard.hide();
    onSaveProfile({ name: cleanName, bio: bio.trim(), avatarUrl: profile?.avatarUrl || user?.photoUrl || undefined });
    setEditing(false);
    setError("");
  };

  if (!profile || editing) {
    return (
      <MobileScroll className="app-screen">
        <main className="screen-content standard-screen" data-testid="profile-screen">
          <ScreenHeader eyebrow="Profile" title={profile ? "Edit profile" : "Create your profile"} />
          <form className="quote-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Display name</span>
              <KeyboardInput
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError("");
                }}
                onBlur={() => keyboard.hide()}
                maxLength={40}
                placeholder="Your name"
                autoComplete="name"
                aria-describedby={error ? "profile-error" : undefined}
              />
            </label>
            <label className="form-field">
              <span>Bio <em>Optional</em></span>
              <KeyboardTextarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                onBlur={() => keyboard.hide()}
                maxLength={120}
                rows={4}
                placeholder="A little about you"
              />
            </label>
            {error ? <p id="profile-error" className="form-error" role="alert">{error}</p> : null}
            <button type="submit" className="primary-button publish-button">Save profile</button>
          </form>
        </main>
      </MobileScroll>
    );
  }

  return (
    <MobileScroll className="app-screen">
      <main className="screen-content standard-screen" data-testid="profile-screen">
        <ScreenHeader eyebrow="Profile" title="Your space" />
        <section className="profile-summary">
          <div className="profile-avatar" aria-hidden="true">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="profile-copy">
            <h2>{profile.name}</h2>
            {profile.bio ? <p>{profile.bio}</p> : null}
            {user?.email ? <p className="profile-email">{user.email}</p> : null}
          </div>
          <button type="button" className="icon-button" aria-label="Edit profile" onClick={() => setEditing(true)}>
            <Pencil1Icon width={18} height={18} aria-hidden="true" />
          </button>
        </section>

        <section className="profile-posts">
          <div className="section-title-row">
            <h2>Your quotes</h2>
            <button type="button" onClick={onCreate}>Add quote</button>
          </div>
          {quotes.length === 0 ? (
            <p className="profile-empty">You haven't published a quote yet.</p>
          ) : (
            <div className="profile-quote-list">
              {quotes.map((quote) => <blockquote key={quote.id}>{quote.text}</blockquote>)}
            </div>
          )}
        </section>
        <div className="profile-session-actions">
          <button type="button" className="sign-out-button" onClick={onSignOut}>Sign out</button>
        </div>
      </main>
    </MobileScroll>
  );
}

function AuthSheet({
  open,
  reason,
  onOpenChange,
  onAuthenticated,
}: {
  open: boolean;
  reason: string;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const keyboard = useKeyboard();
  const screenRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const authAttemptRef = useRef(0);
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      authAttemptRef.current += 1;
      keyboard.hide();
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !screenRef.current) return;
    closeButtonRef.current?.focus();
    if (prefersReducedMotion()) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        ".auth-hero-copy",
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.48, ease: "power3.out" },
      );
      gsap.fromTo(
        ".auth-form-zone",
        { yPercent: 8, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 0.58, ease: "power3.out" },
      );
    }, screenRef);

    return () => context.revert();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleSheetOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !screenRef.current) return;

      const focusable = Array.from(
        screenRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const authenticate = async (work: () => Promise<AuthUser>) => {
    const attempt = authAttemptRef.current + 1;
    authAttemptRef.current = attempt;
    setBusy(true);
    setError("");
    try {
      const user = await work();
      if (attempt !== authAttemptRef.current) return;
      onAuthenticated(user);
      setEmail("");
      setPassword("");
      setName("");
    } catch (authError) {
      if (attempt !== authAttemptRef.current) return;
      setError(authError instanceof AuthError ? authError.message : "Sign-in could not be completed. Please try again.");
    } finally {
      if (attempt === authAttemptRef.current) setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firebaseAuthConfigured) {
      setError("Live sign-in needs the Firebase project keys connected first.");
      return;
    }
    if (mode === "signUp" && !name.trim()) {
      setError("Add a display name to create your account.");
      return;
    }
    keyboard.hide();
    void authenticate(async () => {
      const user = await signInWithEmail(email.trim(), password, mode);
      if (mode !== "signUp") return user;
      try {
        return await updateDisplayName(user, name.trim());
      } catch {
        return user;
      }
    });
  };

  const toggleMode = () => {
    keyboard.hide();
    authAttemptRef.current += 1;
    setMode((current) => current === "signIn" ? "signUp" : "signIn");
    setBusy(false);
    setError("");
  };

  const usePreviewTestAccount = () => {
    keyboard.hide();
    void authenticate(async () => createPreviewTestUser());
  };

  if (!open) return null;

  return (
    <section
      ref={screenRef}
      className="auth-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-screen-title"
      aria-describedby="auth-screen-description"
    >
      <div className="auth-hero">
        <div className="auth-utility-row">
          <button
            ref={closeButtonRef}
            type="button"
            className="auth-back"
            aria-label="Back to quotes"
            onClick={() => handleSheetOpenChange(false)}
          >
            <ChevronLeftIcon width={20} height={20} aria-hidden="true" />
            <span>Back</span>
          </button>
          <p>
            <span>{mode === "signIn" ? "New here?" : "Already joined?"}</span>
            <button type="button" onClick={toggleMode} disabled={busy}>
              {mode === "signIn" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
        <div className="auth-hero-copy">
          <span className="auth-hero-mark" aria-hidden="true">&ldquo;</span>
          <h1>{mode === "signIn" ? "Your words, kept close." : "Make this space yours."}</h1>
        </div>
      </div>

      <div className="auth-panel-backdrop" aria-hidden="true" />
      <div className="auth-form-zone">
        <MobileScroll className="auth-form-scroll">
          <main className="auth-panel">
            <header className="auth-card-heading">
              <p className="auth-kicker">{mode === "signIn" ? "Welcome back" : "New account"}</p>
              <h2 id="auth-screen-title">{mode === "signIn" ? "Sign in to continue" : "Create your account"}</h2>
              <p id="auth-screen-description">{reason}</p>
            </header>

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === "signUp" ? (
                <label className="form-field">
                  <span>Display name</span>
                  <KeyboardInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => keyboard.hide()}
                    autoComplete="name"
                    maxLength={40}
                    placeholder="Your name"
                    required
                  />
                </label>
              ) : null}
              <label className="form-field">
                <span>Email address</span>
                <KeyboardInput
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={() => keyboard.hide()}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className="form-field">
                <span>Password</span>
                <KeyboardInput
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => keyboard.hide()}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  minLength={6}
                  placeholder="At least 6 characters"
                  required
                />
              </label>

              {!firebaseAuthConfigured ? (
                <p className="auth-config-note">
                  {previewTestAuthEnabled
                    ? "Live authentication still needs Firebase keys. The temporary account below only unlocks local preview testing."
                    : "Authentication is ready for a Firebase project connection; no account is simulated in this build."}
                </p>
              ) : null}
              {previewTestAuthEnabled && mode === "signIn" ? (
                <button
                  type="button"
                  className="preview-test-login"
                  disabled={busy}
                  onClick={usePreviewTestAccount}
                >
                  <span>Temporary test email</span>
                  <strong>tester@quotes.test</strong>
                </button>
              ) : null}
              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <button type="submit" className="primary-button auth-submit" disabled={busy}>
                {busy ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
              </button>

              <div className="auth-divider"><span>or continue with</span></div>
              <GoogleSignInButton
                disabled={busy}
                onCredential={(credential) => void authenticate(() => signInWithGoogleCredential(credential))}
                onUnavailable={() => setError("Google sign-in is not connected yet. Connect the project keys or use email once Firebase is ready.")}
              />
            </form>
          </main>
        </MobileScroll>
      </div>
    </section>
  );
}

function GoogleSignInButton({
  disabled,
  onCredential,
  onUnavailable,
}: {
  disabled: boolean;
  onCredential: (credential: string) => void;
  onUnavailable: () => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const unavailableHandlerRef = useRef(onUnavailable);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
    unavailableHandlerRef.current = onUnavailable;
  }, [onCredential, onUnavailable]);

  useEffect(() => {
    if (!googleAuthConfigured || !slotRef.current) return;
    let cancelled = false;
    const slot = slotRef.current;

    const render = () => {
      if (cancelled || !window.google || !slot) return;
      slot.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: getGoogleClientId() ?? "",
        callback: (response) => credentialHandlerRef.current(response.credential),
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.renderButton(slot, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        width: 297,
      });
    };

    if (window.google) {
      render();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    const handleLoad = () => render();
    const handleError = () => {
      if (cancelled) return;
      setLoadFailed(true);
      script?.remove();
      unavailableHandlerRef.current();
    };

    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    return () => {
      cancelled = true;
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };
  }, []);

  if (!googleAuthConfigured) {
    return <button type="button" className="google-setup-button" disabled={disabled} onClick={onUnavailable}>Continue with Google / Gmail</button>;
  }

  if (loadFailed) {
    return <button type="button" className="google-setup-button" disabled>Google sign-in unavailable</button>;
  }

  return <div ref={slotRef} className="google-button-slot" data-disabled={disabled} aria-label="Continue with Google" />;
}

function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="screen-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </header>
  );
}
