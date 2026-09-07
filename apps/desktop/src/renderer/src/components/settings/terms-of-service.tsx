import { FileText } from 'lucide-react';
import { Card } from '@rekordly/ui';

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Acceptance',
    body:
      'By using Rekordly you agree to these terms. If you do not agree, do not use the application. ' +
      'These terms apply to the software as distributed; bundled third-party components remain under their own licenses.',
  },
  {
    title: '2. License & permitted use',
    body:
      'Rekordly is provided for personal, non-commercial use. You may install it, use it, and modify your local copy ' +
      'in accordance with its open-source license. You may not sell the application itself or present it as your own product.',
  },
  {
    title: '3. Respect for platforms and content owners',
    body:
      "Recording or downloading content from a platform is subject to that platform's terms of service and to copyright law. " +
      'You are responsible for ensuring you have the right to record or download any content you target — for example your own ' +
      'streams, content you are licensed to access, or public-domain material.',
  },
  {
    title: '4. No redistribution of recorded content',
    body:
      'Content you capture with Rekordly is for your personal use only. Re-uploading, selling, or publicly sharing recorded ' +
      "material without the rights holder's permission may infringe copyright and is not permitted under these terms.",
  },
  {
    title: '5. User responsibility',
    body:
      'You are solely responsible for how you configure monitoring, which creators you track, and what URLs you download. ' +
      'Rekordly is a tool; it does not curate, endorse, or take responsibility for the content you access with it.',
  },
  {
    title: '6. Copyright complaints',
    body:
      'If you believe content made available through a user of this software infringes your rights, contact the responsible ' +
      'user and/or the hosting platform directly. Rekordly does not host, distribute, or publish any captured media.',
  },
  {
    title: '7. No warranty',
    body:
      'The application is provided "as is", without warranty of any kind. Recording can fail, files can be incomplete, and ' +
      'platforms can change in ways that break functionality at any time.',
  },
  {
    title: '8. Limitation of liability',
    body:
      'To the maximum extent permitted by law, the authors are not liable for any damages arising from use of the application, ' +
      'including account actions taken against you by third-party platforms for violating their terms.',
  },
];

export function TermsOfServiceContent() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-start gap-3 p-4">
        <FileText size={16} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Terms & Conditions</p>
          <p className="mt-1 text-xs text-foreground-muted">
            A plain-language summary of the rules that govern your use of Rekordly.
          </p>
        </div>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.title} className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">{section.body}</p>
        </Card>
      ))}

      <p className="text-[10px] text-foreground-muted">
        Last updated: {new Date().getFullYear()}. This summary describes how the software itself behaves; it is not legal advice.
      </p>
    </div>
  );
}