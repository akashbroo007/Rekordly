import { LegalPage } from "./LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      intro="Rekordly is built to be private by default: there is no account system, no telemetry, and no advertising. This policy explains what little data exists and where it lives."
    >
      <div className="markdown">
        <h2>1. This website</h2>
        <p>
          This website is a static site. It does not set cookies, does not run
          analytics, does not fingerprint visitors, and does not collect
          personal information. Standard, ephemeral server logs may exist
          depending on where the site is hosted, but they are not used to track
          or profile visitors.
        </p>

        <h2>2. The desktop app</h2>
        <p>
          The Rekordly application is local-first. All data it creates —
          tracked creators, monitoring results, recordings, downloads, tags,
          notes, and settings — is stored locally on your own machine in an
          SQLite database. That data is never transmitted to us, and the app
          contains no telemetry, analytics, or tracking of any kind.
        </p>
        <p>
          Because the source code is publicly available, you can verify all of
          this directly in the code.
        </p>

        <h2>3. Third-party connections you initiate</h2>
        <p>
          Rekordly only communicates with the outside world in ways you
          explicitly configure or trigger:
        </p>
        <ul>
          <li>
            <strong>Monitoring and recording</strong> — the app connects to the
            streaming sites you choose to track, as necessary to check status
            and capture streams.
          </li>
          <li>
            <strong>Cloud uploads</strong> — files are sent to a cloud provider
            (Gofile, Catbox, MixDrop, or Google Drive) only when you configure
            that provider and upload.
          </li>
          <li>
            <strong>Updates</strong> — the app contacts GitHub Releases to
            check for new versions.
          </li>
        </ul>
        <p>
          Credentials you enter for upload providers are stored locally on
          your machine and used only to talk to the provider you configured.
          Data sent to third-party providers is governed by those providers'
          own privacy policies.
        </p>

        <h2>4. Contacting us</h2>
        <p>
          If you email us, we use your message and address solely to respond to
          your inquiry. We do not add you to any list or share your details
          with third parties.
        </p>

        <h2>5. Changes to this policy</h2>
        <p>
          If this policy changes, the revised version will be published on this
          page with an updated date. Material changes will be highlighted in
          release notes.
        </p>
      </div>
    </LegalPage>
  );
}
