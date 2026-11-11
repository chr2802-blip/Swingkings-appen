"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { Button } from "@/components/ui";
import { Bolt } from "@/components/crest";
import { isIosGuide, isPhone, type Guide } from "@/lib/install";
import { useInstall, waitForPrompt } from "@/lib/install-client";

/**
 * Getting Swingkings onto the home screen. One button everywhere ("Hent appen"): on Android
 * it opens Chrome's own install prompt, on an iPhone — which has none — it opens a drawer
 * that walks through the share sheet step by step. The first thing after logging in on a
 * phone without the app is the page `/hent-appen` (`InstallWelcome`); after that a card
 * on the overview and a section on the profile.
 */

// ——— Icons ————————————————————————————————————————————————————————————————

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The iPhone's share symbol: a box with an arrow out of the top. */
function ShareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2" strokeLinecap="round" />
    </svg>
  );
}

function AddSquareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" strokeLinecap="round" />
    </svg>
  );
}

function DotsIcon({ vertical = false, className = "h-5 w-5" }: { vertical?: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`${className} ${vertical ? "rotate-90" : ""}`} fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function MenuIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppTile({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <Image
      src="/icon-192.png"
      alt=""
      width={192}
      height={192}
      className={`${className} shrink-0 rounded-[22%] shadow-md ring-1 ring-black/5`}
    />
  );
}

/** A word on the phone's own screen, drawn the way the phone draws it. */
function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 align-middle text-[0.8125rem] font-semibold whitespace-nowrap text-slate-800">
      {icon}
      {children}
    </span>
  );
}

// ——— The guides ——————————————————————————————————————————————————————————

type Step = { icon: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode };

const OPEN_FROM_HOME: Step = {
  icon: <AppTile className="h-7 w-7" />,
  title: "Åbn Swingkings fra hjemmeskærmen",
  hint: "Log ind dér én gang, så er du klar. Appen husker dig.",
};

const iosAdd: Step[] = [
  {
    icon: <AddSquareIcon />,
    title: (
      <>
        Vælg <Chip icon={<AddSquareIcon className="h-4 w-4" />}>Føj til hjemmeskærm</Chip>
      </>
    ),
    hint: (
      <>
        Rul lidt ned i listen. Kan du ikke se den, så tryk på <Chip>Vis flere</Chip>
      </>
    ),
  },
  {
    icon: <CheckIcon />,
    title: (
      <>
        Tryk <Chip>Tilføj</Chip> øverst til højre
      </>
    ),
    hint: "Lad “Åbn som webapp” være slået til, hvis du bliver spurgt.",
  },
  OPEN_FROM_HOME,
];

const GUIDES: Record<Guide, { title: string; intro?: string; steps: Step[] }> = {
  "ios-safari": {
    title: "Hent appen på din iPhone",
    intro: "Det tager under et minut. Følg de fire trin her i Safari:",
    steps: [
      {
        icon: <ShareIcon />,
        title: (
          <>
            Tryk på <Chip icon={<ShareIcon className="h-4 w-4" />}>Del</Chip>
          </>
        ),
        hint: (
          <>
            Den sidder i Safaris bjælke nederst på skærmen. Ser du den ikke, så tryk først på{" "}
            <Chip icon={<DotsIcon className="h-4 w-4" />}>Mere</Chip>
          </>
        ),
      },
      ...iosAdd,
    ],
  },
  "ios-chrome": {
    title: "Hent appen på din iPhone",
    intro: "Det tager under et minut. Følg de fire trin her i Chrome:",
    steps: [
      {
        icon: <ShareIcon />,
        title: (
          <>
            Tryk på <Chip icon={<ShareIcon className="h-4 w-4" />}>Del</Chip> i adressefeltet
          </>
        ),
        hint: "Øverst til højre, ved siden af webadressen.",
      },
      ...iosAdd,
    ],
  },
  "ios-other": {
    title: "Hent appen på din iPhone",
    intro: "Det går nemmest i Safari, men kan også lade sig gøre her:",
    steps: [
      {
        icon: <ShareIcon />,
        title: (
          <>
            Find <Chip icon={<ShareIcon className="h-4 w-4" />}>Del</Chip> i browserens menu
          </>
        ),
        hint: "Ofte bag de tre prikker eller streger i et af hjørnerne.",
      },
      ...iosAdd,
    ],
  },
  "in-app": {
    title: "Åbn siden i din browser",
    intro: "Du er inde i en anden app (fx Facebook eller Instagram), og herfra kan Swingkings ikke lægges på hjemmeskærmen.",
    steps: [
      {
        icon: <DotsIcon />,
        title: (
          <>
            Tryk på <Chip icon={<DotsIcon className="h-4 w-4" />}>…</Chip> i et af hjørnerne
          </>
        ),
        hint: "Eller kopiér linket nedenfor og sæt det ind i Safari eller Chrome.",
      },
      {
        icon: <ShareIcon />,
        title: (
          <>
            Vælg <Chip>Åbn i browser</Chip>
          </>
        ),
        hint: "Den kan også hedde “Åbn i Safari” eller “Åbn i Chrome”.",
      },
      {
        icon: <DownloadIcon />,
        title: (
          <>
            Tryk <Chip>Hent appen</Chip> igen dér
          </>
        ),
      },
    ],
  },
  "android-chrome": {
    title: "Hent appen på din telefon",
    intro: "Chrome viste ikke installationen af sig selv. Sådan gør du i stedet:",
    steps: [
      {
        icon: <DotsIcon vertical />,
        title: (
          <>
            Tryk på <Chip icon={<DotsIcon vertical className="h-4 w-4" />}>Menu</Chip> øverst til højre
          </>
        ),
      },
      {
        icon: <AddSquareIcon />,
        title: (
          <>
            Vælg <Chip>Installér app</Chip> eller <Chip>Føj til startskærm</Chip>
          </>
        ),
      },
      {
        icon: <CheckIcon />,
        title: (
          <>
            Tryk <Chip>Installér</Chip>
          </>
        ),
      },
      OPEN_FROM_HOME,
    ],
  },
  "android-samsung": {
    title: "Hent appen på din telefon",
    steps: [
      {
        icon: <MenuIcon />,
        title: (
          <>
            Tryk på <Chip icon={<MenuIcon className="h-4 w-4" />}>Menu</Chip> nederst til højre
          </>
        ),
      },
      {
        icon: <AddSquareIcon />,
        title: (
          <>
            Vælg <Chip>Tilføj side til</Chip> og så <Chip>Startskærm</Chip>
          </>
        ),
      },
      {
        icon: <CheckIcon />,
        title: (
          <>
            Tryk <Chip>Tilføj</Chip>
          </>
        ),
      },
      OPEN_FROM_HOME,
    ],
  },
  "android-firefox": {
    title: "Hent appen på din telefon",
    steps: [
      {
        icon: <DotsIcon vertical />,
        title: (
          <>
            Tryk på <Chip icon={<DotsIcon vertical className="h-4 w-4" />}>Menu</Chip>
          </>
        ),
      },
      {
        icon: <AddSquareIcon />,
        title: (
          <>
            Vælg <Chip>Installér</Chip> eller <Chip>Føj til startskærm</Chip>
          </>
        ),
      },
      OPEN_FROM_HOME,
    ],
  },
  "android-other": {
    title: "Hent appen på din telefon",
    intro: "Det går nemmest i Chrome, men de fleste browsere kan det:",
    steps: [
      {
        icon: <DotsIcon vertical />,
        title: "Åbn browserens menu",
        hint: "Tre prikker eller streger, oftest øverst eller nederst til højre.",
      },
      {
        icon: <AddSquareIcon />,
        title: (
          <>
            Vælg <Chip>Installér app</Chip> eller <Chip>Føj til startskærm</Chip>
          </>
        ),
      },
      OPEN_FROM_HOME,
    ],
  },
  desktop: {
    title: "Hent appen på din telefon",
    intro: "Swingkings er lavet til mobilen. Åbn adressen her på din telefon og tryk “Hent appen”:",
    steps: [],
  },
};

function CopyLink() {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(window.location.origin), []);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pl-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{url.replace(/^https?:\/\//, "")}</span>
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            /* the address is right there to copy by hand */
          }
        }}
      >
        {copied ? "Kopieret ✓" : "Kopiér link"}
      </Button>
    </div>
  );
}

export function InstallGuide({
  open,
  onClose,
  guide,
  onDone,
  oneTap,
}: {
  open: boolean;
  onClose: () => void;
  guide: Guide;
  /** "Jeg har gjort det": an iPhone never tells us, so we take their word for it. */
  onDone?: () => void;
  /** Chrome's prompt arrived while the guide was open: install with one tap after all. */
  oneTap?: () => void;
}) {
  const { title, intro, steps } = GUIDES[guide];
  const showLink = guide === "in-app" || guide === "desktop";
  return (
    <Modal open={open} onClose={onClose} title={title} size="drawer">
      <ModalBody className="space-y-5">
        {oneTap ? (
          <div className="animate-pop space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-sm font-medium text-emerald-900">Nu er din telefon klar. Det klares med ét tryk:</p>
            <Button className="w-full rounded-2xl py-3.5 text-base font-semibold shadow-md" onClick={oneTap}>
              <DownloadIcon />
              Installér nu
            </Button>
          </div>
        ) : (
          intro && <p className="text-sm text-slate-600">{intro}</p>
        )}
        {steps.length > 0 && (
          <ol className="space-y-2.5">
            {steps.map((step, index) => (
              <li
                key={index}
                className="animate-row-in flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                style={{ animationDelay: `${80 + index * 70}ms`, animationFillMode: "both" }}
              >
                <div className="relative shrink-0">
                  <div className="accent-tint-bg flex h-11 w-11 items-center justify-center rounded-xl text-[var(--accent-text)]">
                    {step.icon}
                  </div>
                  <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[0.6875rem] font-bold text-white ring-2 ring-white">
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <p className="text-[0.9375rem] leading-[1.6rem] font-semibold text-slate-900">{step.title}</p>
                  {step.hint && <p className="mt-0.5 text-sm leading-[1.4rem] text-slate-500">{step.hint}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {showLink && <CopyLink />}
        {guide.startsWith("android-") && (
          <p className="text-center text-xs text-slate-500">Har du allerede appen? Så find Swingkings på din startskærm.</p>
        )}
      </ModalBody>
      <ModalFooter>
        {onDone && isIosGuide(guide) ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 py-3" onClick={onClose}>
              Senere
            </Button>
            <Button
              className="flex-[2] py-3"
              onClick={() => {
                onDone();
                onClose();
              }}
            >
              <CheckIcon className="h-4 w-4" />
              Jeg har gjort det
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="w-full py-3" onClick={onClose}>
            Luk
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

// ——— The button ——————————————————————————————————————————————————————————

/**
 * "Hent appen". Android: Chrome's own prompt when it has one, the guide when not.
 * iPhone: the guide.
 */
export function InstallButton({
  serverGuide,
  size = "large",
  variant = "primary",
  className = "",
  onInstalled,
}: {
  serverGuide?: Guide;
  size?: "large" | "normal";
  variant?: "primary" | "secondary";
  className?: string;
  onInstalled?: () => void;
}) {
  const install = useInstall(serverGuide);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function prompt() {
    setBusy(true);
    try {
      if ((await install.prompt()) === "accepted") {
        setGuideOpen(false);
        onInstalled?.();
      }
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (install.canPrompt) return prompt();
    // On Android Chrome may not have offered its prompt yet: give it a moment.
    if (install.guide.startsWith("android-") && install.guide !== "android-firefox") {
      setBusy(true);
      const ready = await waitForPrompt(2500);
      setBusy(false);
      if (ready) return prompt();
    }
    setGuideOpen(true);
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={start}
        disabled={busy}
        className={`${size === "large" ? "w-full rounded-2xl py-3.5 text-base font-semibold shadow-md" : ""} ${className}`}
      >
        {busy ? (
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <DownloadIcon className={size === "large" ? "h-5 w-5" : "h-4 w-4"} />
        )}
        {busy ? "Et øjeblik…" : "Hent appen"}
      </Button>
      <InstallGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        guide={install.guide}
        oneTap={install.canPrompt ? prompt : undefined}
        onDone={() => {
          install.markInstalled();
          onInstalled?.();
        }}
      />
    </>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-700">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckIcon className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}

function Pitch() {
  return (
    <ul className="space-y-2.5">
      <Benefit>Ligger på hjemmeskærmen og åbner som en rigtig app</Benefit>
      <Benefit>Besked med det samme om bøder, opgaver og chat</Benefit>
      <Benefit>Gratis, fylder næsten ingenting og kræver ingen App Store</Benefit>
    </ul>
  );
}

function Installed() {
  return (
    <div className="animate-pop space-y-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckIcon className="h-7 w-7" />
      </div>
      <p className="font-display text-xl">Appen er på vej!</p>
      <p className="text-sm text-slate-600">Find Swingkings på din hjemmeskærm og log ind dér.</p>
    </div>
  );
}

// ——— After login —————————————————————————————————————————————————————————

/** Whether to make the offer at all on this browser right now. */
function wanted(install: ReturnType<typeof useInstall>) {
  return install.ready && !install.installed && (isPhone(install.guide) || install.canPrompt);
}

/**
 * In the login and invite forms: where to land once logged in. The browser knows whether
 * the app is already on this phone (or this is the app); the server does not.
 */
export function AfterLoginField() {
  const install = useInstall();
  const offer = install.ready && !install.installed && isPhone(install.guide);
  return <input type="hidden" name="next" value={offer ? "/hent-appen" : "/oversigt"} />;
}

/** `/hent-appen`: the first thing after logging in on a phone without the app. */
export function InstallWelcome({ firstName, serverGuide }: { firstName: string; serverGuide: Guide }) {
  const install = useInstall(serverGuide);
  const router = useRouter();
  const [done, setDone] = useState(false);

  // Opened inside the app after all: nothing to offer here.
  useEffect(() => {
    if (install.ready && install.standalone) router.replace("/oversigt");
  }, [install.ready, install.standalone, router]);

  return (
    <div className="animate-page-in space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {done ? (
          <Installed />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3.5">
              <AppTile className="h-14 w-14" />
              <div className="min-w-0">
                <p className="font-display text-xl leading-tight">Hent Swingkings på din telefon</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                  <Bolt className="h-3.5 w-3.5" /> Det tager under et minut
                </p>
              </div>
            </div>
            <Pitch />
            <div className="mt-5">
              <InstallButton serverGuide={serverGuide} onInstalled={() => setDone(true)} />
            </div>
            {isIosGuide(install.guide) && (
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                På iPhone skal du logge ind én gang til, når du åbner appen første gang.
              </p>
            )}
          </>
        )}
      </div>
      <Link
        href="/oversigt"
        // Passed over just now: the overview's card need not ask again straight away.
        onClick={() => !done && install.putOff()}
        className="press-button mx-auto block w-fit rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        {done ? "Fortsæt i browseren →" : `Fortsæt til holdet, ${firstName} →`}
      </Link>
    </div>
  );
}

/** On the overview until the app is on the phone or put off for a few days. */
export function InstallCard() {
  const install = useInstall();
  const [hidden, setHidden] = useState(false);
  if (hidden || !wanted(install) || install.later) return null;
  return (
    <div className="animate-row-in flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--accent-line)] bg-white p-4 shadow-sm">
      <AppTile className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">Få Swingkings på hjemmeskærmen</p>
        <p className="text-sm text-slate-500">Åbner som en app og giver besked om bøder og opgaver.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          onClick={() => {
            install.putOff();
            setHidden(true);
          }}
          className="press-button rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Senere
        </button>
        <InstallButton size="normal" className="flex-1 sm:flex-none" onInstalled={() => setHidden(true)} />
      </div>
    </div>
  );
}

/** On the profile, always: the way back to the guide, or word that this is the app. */
export function InstallSection() {
  const install = useInstall();
  if (!install.ready) return null;
  if (install.standalone) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <AppTile className="h-9 w-9" />
        Du bruger Swingkings som app. Godt gået! 🎉
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <AppTile className="h-9 w-9" />
      <p className="min-w-0 flex-1 text-slate-600">
        {install.installed ? "Appen ligger på din telefon. Åbn den fra hjemmeskærmen." : "Læg Swingkings på hjemmeskærmen som en app."}
      </p>
      <InstallButton size="normal" variant={install.installed ? "secondary" : "primary"} />
    </div>
  );
}
