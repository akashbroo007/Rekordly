import { LegalPage } from "./LegalPage";
import { site } from "../../content/site";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms govern your use of the Rekordly website and the Rekordly desktop application. By using either, you agree to them."
    >
      <div className="markdown">
        <h2>1. The software</h2>
        <p>
          Rekordly is source-available desktop software, licensed under the{" "}
          <a href={site.licenseUrl}>PolyForm Noncommercial License 1.0.0</a>.
          You may use, modify, and share the software free of charge for
          personal, educational, and other noncommercial purposes. The software
          is provided "as is", without warranty of any kind, express or
          implied, including but not limited to the warranties of
          merchantability, fitness for a particular purpose, and
          non-infringement. In no event shall the authors or copyright holders
          be liable for any claim, damages, or other liability arising from,
          out of, or in connection with the software or its use.
        </p>

        <h2>1b. Commercial use</h2>
        <p>
          Any commercial use of the software — including use by a company or
          other business organization, resale, redistribution as part of a
          paid product or service, or internal business use — requires a
          separate commercial license from Rekordly. Commercial licenses are
          available exclusively from Rekordly; contact{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> to purchase one.
        </p>

        <h2>2. Acceptable use</h2>
        <p>
          You are solely responsible for how you use Rekordly, including any
          content you monitor, record, download, or upload with it. You agree
          to use the software only in ways that comply with:
        </p>
        <ul>
          <li>
            the terms of service and usage policies of the platforms and
            websites you access with it, and
          </li>
          <li>all applicable local, national, and international laws.</li>
        </ul>
        <p>
          Recording, redistributing, or re-uploading content you do not have
          the rights to may infringe copyright or breach platform terms. You
          bear that responsibility, not Rekordly or its contributors.
        </p>

        <h2>3. No affiliation</h2>
        <p>
          Rekordly is an independent, community-driven project. It is not
          affiliated with, endorsed by, or sponsored by any of the streaming
          platforms it supports. Platform names are used solely to describe
          compatibility.
        </p>

        <h2>4. Third-party services</h2>
        <p>
          Rekordly can connect to third-party services (such as cloud upload
          providers) that you configure yourself. Your use of those services is
          governed by their own terms and policies. We are not responsible for
          third-party services or any data you send to them.
        </p>

        <h2>5. No warranty of availability</h2>
        <p>
          Streaming sites change frequently and may break plugin support at any
          time. We do not guarantee that any particular site, feature, or
          recording will continue to work, nor that the software will be
          error-free or uninterrupted.
        </p>

        <h2>6. Changes to these terms</h2>
        <p>
          We may update these terms as the project evolves. Changes are
          published on this page with an updated date. Continued use of the
          website or software after changes take effect constitutes acceptance
          of the revised terms.
        </p>
      </div>
    </LegalPage>
  );
}
