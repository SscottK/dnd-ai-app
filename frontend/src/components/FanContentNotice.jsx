import {
  APP_NAME,
  FAN_CONTENT_DISCLAIMER,
  FAN_CONTENT_POLICY_URL,
} from "../constants/branding";

export function FanContentNotice({ className = "" }) {
  return (
    <p className={`text-[10px] font-mono leading-relaxed text-zinc-600 ${className}`}>
      {FAN_CONTENT_DISCLAIMER}{" "}
      <a
        href={FAN_CONTENT_POLICY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-neon-cyan"
      >
        Fan Content Policy
      </a>
      .
    </p>
  );
}

/** Shared copy for login / request-access landing. */
export function SiteAboutBlurb() {
  return (
    <div className="space-y-3 text-left text-xs font-mono leading-relaxed text-zinc-400 normal-case tracking-normal">
      <p>
        <span className="font-sans font-black uppercase tracking-wide text-starlight">
          {APP_NAME}
        </span>{" "}
        is a private D&amp;D <span className="text-zinc-300">5.5e / 2024</span> companion for
        campaigns, live sessions, digital character sheets, encounters, and rules lookup.
      </p>
      <p>
        It&apos;s built for me and my friends — a personal table tool, not a public product. Accounts
        are <span className="text-zinc-300">request-access only</span> so the group stays small,
        invites stay intentional, and I can approve who joins before anyone gets in.
      </p>
    </div>
  );
}
